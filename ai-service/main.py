"""
VeriVote Kenya — AI Fraud Detection & Continuous Monitoring Microservice

On-demand endpoints:
  POST /api/ai/analyze-voting-pattern   — anomaly detection + LLM explanation
  GET  /api/ai/health                   — liveness check (includes Ollama status)
  GET  /api/ai/audit/recent             — recent on-demand decisions for dashboard
  GET  /api/ai/model-info               — model metadata
  GET  /api/ai/llm-status               — Ollama health + model availability

Continuous monitoring endpoints (auto-refreshed every 30–300 s):
  GET  /api/ai/monitor/status           — monitoring engine heartbeat
  GET  /api/ai/reports/fraud            — fraud activity report (last 24 h)
  GET  /api/ai/reports/integrity        — blockchain vs tally integrity report
  GET  /api/ai/reports/security         — security events report
  GET  /api/ai/reports/health           — combined system health
  GET  /api/ai/monitor/station/:id      — per-station score history
  GET  /api/ai/monitor/scores           — latest station scores (all elections)
"""

from __future__ import annotations

import json
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import audit_logger
import rule_engine
import llm_explainer
import reporter
import storage
from rule_engine import Severity
from monitor import MonitoringEngine

# ── Paths ─────────────────────────────────────────────────────────────────────
MODELS      = Path(__file__).parent / "models"
MODEL_PATH  = MODELS / "isolation_forest.joblib"
SCALER_PATH = MODELS / "scaler.joblib"
META_PATH   = MODELS / "model_meta.json"

FEATURES = [
    "voting_velocity",
    "temporal_deviation",
    "geographic_cluster_score",
    "repeat_attempt_rate",
    "distress_correlation",
]

# ── Global artefacts ──────────────────────────────────────────────────────────
_model  = None
_scaler = None
_meta: dict[str, Any] = {}
_monitor: MonitoringEngine | None = None


def _load_model() -> None:
    global _model, _scaler, _meta
    if not MODEL_PATH.exists():
        raise RuntimeError(
            f"Model not found at {MODEL_PATH}. "
            "Run: python training/generate_data.py && python training/train_model.py"
        )
    _model  = joblib.load(MODEL_PATH)
    _scaler = joblib.load(SCALER_PATH)
    with open(META_PATH) as f:
        _meta = json.load(f)


# ── Lifespan: start model + monitoring engine ─────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _monitor
    _load_model()
    print("VeriVote AI Service — model loaded.")
    print(f"  Features: {FEATURES}")
    print(f"  Alert threshold: {_meta.get('anomaly_threshold', 70)}")

    _monitor = MonitoringEngine(model=_model, scaler=_scaler)
    await _monitor.start()
    print("  Continuous monitoring engine started.")
    print("  Monitoring intervals: station=60s | integrity=300s | security=30s")

    yield   # ← application runs here

    print("VeriVote AI Service shutting down.")


# ── FastAPI app ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="VeriVote AI Fraud Detection & Monitoring",
    description=(
        "Sovereign anomaly detection and continuous election monitoring for Kenya. "
        "All inference runs on-premise — no voter data leaves Kenyan infrastructure."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3005", "http://localhost:3001"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


# ── Request / Response schemas ────────────────────────────────────────────────

class VotingPatternRequest(BaseModel):
    station_code:              str   = Field(..., description="IEBC polling station code")
    voting_velocity:           float = Field(..., ge=0.0, le=1.0)
    temporal_deviation:        float = Field(..., ge=0.0, le=1.0)
    geographic_cluster_score:  float = Field(..., ge=0.0, le=1.0)
    repeat_attempt_rate:       float = Field(..., ge=0.0, le=1.0)
    distress_correlation:      float = Field(..., ge=0.0, le=1.0)
    recent_distress_count:     int   = Field(0,    ge=0)
    window_minutes:            int   = Field(30,   ge=1, le=1440)
    station_hourly_average:    float | None = Field(None, ge=0)


class RuleDetail(BaseModel):
    rule_id:     str
    severity:    str
    description: str
    evidence:    dict[str, Any]


class AnalysisResponse(BaseModel):
    request_id:          str
    station_code:        str
    anomaly_score:       float = Field(..., description="0=normal, 100=extreme anomaly")
    alert_level:         str   = Field(..., description="NONE | LOW | MEDIUM | HIGH | CRITICAL")
    alert_triggered:     bool
    model_prediction:    str   = Field(..., description="normal | anomaly")
    rule_severity:       str
    triggered_rules:     list[RuleDetail]
    features:            dict[str, float]
    message:             str
    explanation:         str
    explanation_tier:    str
    explanation_model:   str | None = None
    explanation_latency_ms: float
    sovereignty_note:    str = "All inference executed on-premise. No data transmitted externally."


# ── Helpers ───────────────────────────────────────────────────────────────────

def _score_to_anomaly(raw_score: float) -> float:
    clamped    = max(-0.6, min(0.4, raw_score))
    normalised = (-clamped + 0.6) / 1.0
    return round(min(100.0, max(0.0, normalised * 100)), 1)


def _alert_level(anomaly_score: float, rule_severity: Severity) -> str:
    if rule_severity == Severity.CRITICAL:
        return "CRITICAL"
    if anomaly_score >= 85 or rule_severity == Severity.HIGH:
        return "HIGH"
    if anomaly_score >= 70 or rule_severity == Severity.MEDIUM:
        return "MEDIUM"
    if anomaly_score >= 50 or rule_severity == Severity.LOW:
        return "LOW"
    return "NONE"


# ── On-demand analysis ────────────────────────────────────────────────────────

@app.post("/api/ai/analyze-voting-pattern", response_model=AnalysisResponse)
async def analyze_voting_pattern(body: VotingPatternRequest, request: Request) -> AnalysisResponse:
    if _model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    t_start    = time.perf_counter()
    request_id = str(uuid.uuid4())

    features_dict = {
        "voting_velocity":          body.voting_velocity,
        "temporal_deviation":       body.temporal_deviation,
        "geographic_cluster_score": body.geographic_cluster_score,
        "repeat_attempt_rate":      body.repeat_attempt_rate,
        "distress_correlation":     body.distress_correlation,
    }

    X        = np.array([[features_dict[f] for f in FEATURES]])
    X_scaled = _scaler.transform(X)
    raw_score  = float(_model.decision_function(X_scaled)[0])
    pred_label = "anomaly" if _model.predict(X_scaled)[0] == -1 else "normal"
    anomaly_score = _score_to_anomaly(raw_score)

    re_output = rule_engine.evaluate(
        station_code=body.station_code,
        voting_velocity=body.voting_velocity,
        temporal_deviation=body.temporal_deviation,
        geographic_cluster_score=body.geographic_cluster_score,
        repeat_attempt_rate=body.repeat_attempt_rate,
        distress_correlation=body.distress_correlation,
        recent_distress_count=body.recent_distress_count,
        window_minutes=body.window_minutes,
        station_hourly_average=body.station_hourly_average,
    )

    final_level    = _alert_level(anomaly_score, re_output.overall_severity)
    alert_triggered = final_level in ("MEDIUM", "HIGH", "CRITICAL")
    processing_ms  = (time.perf_counter() - t_start) * 1000

    triggered_rules_dicts = [
        {
            "rule_id":     r.rule_id,
            "severity":    r.severity.value,
            "description": r.description,
            "evidence":    r.evidence,
        }
        for r in re_output.triggered_rules
    ]

    explanation_result = await llm_explainer.explain_anomaly(
        station_code=body.station_code,
        anomaly_score=anomaly_score,
        alert_level=final_level,
        features=features_dict,
        triggered_rules=triggered_rules_dicts,
        station_hourly_average=body.station_hourly_average,
    )

    audit_logger.log_decision(
        request_id=request_id,
        station_code=body.station_code,
        features=features_dict,
        anomaly_score=anomaly_score,
        model_prediction=pred_label,
        rule_severity=re_output.overall_severity.value,
        triggered_rules=triggered_rules_dicts,
        final_alert_level=final_level,
        alert_triggered=alert_triggered,
        processing_ms=processing_ms + explanation_result.latency_ms,
        source_ip=request.client.host if request.client else "unknown",
        explanation=explanation_result.explanation,
        explanation_tier=explanation_result.tier,
        explanation_model=explanation_result.model,
    )

    if alert_triggered:
        audit_logger.log_alert_dispatched(
            request_id=request_id,
            station_code=body.station_code,
            alert_level=final_level,
            anomaly_score=anomaly_score,
            channels=["socket.io", "admin_dashboard"],
        )

    if final_level == "CRITICAL":
        message = f"CRITICAL: Station {body.station_code} requires immediate verification. Score {anomaly_score}/100."
    elif final_level == "HIGH":
        message = f"HIGH ALERT: Suspicious pattern at station {body.station_code}. Score {anomaly_score}/100."
    elif final_level == "MEDIUM":
        message = f"MEDIUM: Elevated signals at station {body.station_code}. Score {anomaly_score}/100. Monitor closely."
    else:
        message = f"Normal voting pattern at station {body.station_code}. Score {anomaly_score}/100."

    return AnalysisResponse(
        request_id=request_id,
        station_code=body.station_code,
        anomaly_score=anomaly_score,
        alert_level=final_level,
        alert_triggered=alert_triggered,
        model_prediction=pred_label,
        rule_severity=re_output.overall_severity.value,
        triggered_rules=[
            RuleDetail(
                rule_id=r.rule_id,
                severity=r.severity.value,
                description=r.description,
                evidence=r.evidence,
            )
            for r in re_output.triggered_rules
        ],
        features={k: round(v, 4) for k, v in features_dict.items()},
        message=message,
        explanation=explanation_result.explanation,
        explanation_tier=explanation_result.tier,
        explanation_model=explanation_result.model,
        explanation_latency_ms=round(explanation_result.latency_ms, 1),
    )


# ── Static info / liveness ────────────────────────────────────────────────────

@app.get("/api/ai/health")
async def health() -> dict[str, Any]:
    llm_status = await llm_explainer.check_ollama_health()
    mon_status = _monitor.status if _monitor else {"running": False}
    return {
        "status":        "ok",
        "model_loaded":  _model is not None,
        "model_meta":    _meta,
        "llm":           llm_status,
        "monitoring":    mon_status,
        "sovereignty":   "on-premise — no external API calls",
    }


@app.get("/api/ai/llm-status")
async def llm_status() -> dict[str, Any]:
    status = await llm_explainer.check_ollama_health()
    return {
        **status,
        "fallback_active":       not status.get("model_available", False),
        "fallback_description":  "Template-based explanations (deterministic, fully auditable)",
        "gpu_upgrade_path":      "Set OLLAMA_MODEL=llama3.2:8b when GPU available — no code changes required",
        "sovereignty":           "on-premise — no external API calls at any tier",
    }


@app.get("/api/ai/model-info")
async def model_info() -> dict[str, Any]:
    if not _meta:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {
        "features":           FEATURES,
        "meta":               _meta,
        "alert_threshold":    _meta.get("anomaly_threshold", 70),
        "rule_engine_rules": [
            "R01_DISTRESS_CLUSTER", "R02_DISTRESS_CORRELATION_EXTREME",
            "R03_VELOCITY_SURGE",   "R04_GEOGRAPHIC_SURGE",
            "R05_REPEAT_PIN_ATTEMPTS", "R06_TEMPORAL_ANOMALY",
            "R07_VELOCITY_DISTRESS_COMBINED", "R08_MULTI_SIGNAL",
        ],
        "sovereignty_note":   "All inference on-premise. No data transmitted externally.",
    }


@app.get("/api/ai/audit/recent")
async def recent_audit(limit: int = 50) -> dict[str, Any]:
    entries = audit_logger.read_recent_decisions(limit=min(limit, 200))
    return {"count": len(entries), "entries": entries}


# ── Continuous monitoring endpoints ──────────────────────────────────────────

@app.get("/api/ai/monitor/status")
async def monitor_status() -> dict[str, Any]:
    """Monitoring engine heartbeat — intervals, last-run timestamps, counters."""
    if not _monitor:
        return {"running": False, "error": "Monitoring engine not initialised"}
    return {
        **_monitor.status,
        "intervals": {
            "station_seconds":   60,
            "integrity_seconds": 300,
            "security_seconds":  30,
        },
        "description": (
            "Station fraud scores updated every 60 s. "
            "Blockchain/tally integrity checked every 5 min. "
            "Security events scanned every 30 s."
        ),
    }


@app.get("/api/ai/monitor/scores")
async def monitor_scores(limit: int = 100, alert_level: str | None = None) -> dict[str, Any]:
    """Latest per-station anomaly scores from the monitoring loop."""
    scores = storage.get_latest_station_scores(limit=min(limit, 500), alert_level=alert_level)
    return {
        "count":  len(scores),
        "scores": scores,
    }


@app.get("/api/ai/monitor/station/{station_id}")
async def station_history(station_id: str, limit: int = 50) -> dict[str, Any]:
    """Score history for a specific polling station."""
    history = storage.get_station_history(station_id, limit=min(limit, 200))
    return {
        "station_id": station_id,
        "count":      len(history),
        "history":    history,
    }


@app.get("/api/ai/reports/fraud")
async def report_fraud(hours: int = 24) -> dict[str, Any]:
    """
    Fraud activity report — aggregated anomaly scores, top-risk stations,
    and recommended actions for the last N hours.
    """
    return reporter.generate_fraud_report(hours=min(hours, 168))


@app.get("/api/ai/reports/integrity")
async def report_integrity() -> dict[str, Any]:
    """
    Blockchain vs homomorphic tally integrity report.
    Flags any discrepancy between votes confirmed on-chain and the ceremony tally.
    """
    return reporter.generate_integrity_report()


@app.get("/api/ai/reports/security")
async def report_security() -> dict[str, Any]:
    """
    Security events report — distress clusters, velocity surges, after-hours
    voting, blockchain lag, and other anomalies detected by continuous monitoring.
    """
    return reporter.generate_security_report()


@app.get("/api/ai/reports/health")
async def report_health() -> dict[str, Any]:
    """
    Combined system health report — single view of fraud, integrity, and security status.
    """
    mon_status = _monitor.status if _monitor else {}
    return reporter.generate_system_health(mon_status)
