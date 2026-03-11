"""
Audit logger — every AI decision is written to a structured JSONL log.

Satisfies NIRU Stage 2 D2 (Transparency & Auditability):
  "Ability to trace and explain decisions: logs, explanation screens, dashboards,
   or documentation that allow supervisors, auditors, or investigators to
   reconstruct what the system did and why."

Log entries are append-only JSONL (one JSON object per line).
File rotates daily: logs/audit_YYYY-MM-DD.jsonl
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(exist_ok=True)

# Also emit to stderr so process logs capture everything
_console = logging.getLogger("ai_service")
_console.setLevel(logging.INFO)
if not _console.handlers:
    _console.addHandler(logging.StreamHandler())


def _log_file() -> Path:
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return LOG_DIR / f"audit_{date_str}.jsonl"


def log_decision(
    *,
    request_id: str,
    station_code: str,
    features: dict[str, float],
    anomaly_score: float,
    model_prediction: str,
    rule_severity: str,
    triggered_rules: list[dict[str, Any]],
    final_alert_level: str,
    alert_triggered: bool,
    processing_ms: float,
    source_ip: str = "internal",
    explanation: str | None = None,
    explanation_tier: str | None = None,
    explanation_model: str | None = None,
) -> None:
    """
    Write a single audit entry. Called for every /analyze-voting-pattern request.
    Includes LLM explanation and tier so supervisors can reconstruct every decision (NIRU D2).
    """
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "request_id": request_id,
        "station_code": station_code,
        "source_ip": source_ip,
        "features": {k: round(v, 6) for k, v in features.items()},
        "anomaly_score": anomaly_score,
        "model_prediction": model_prediction,
        "rule_severity": rule_severity,
        "triggered_rules": triggered_rules,
        "final_alert_level": final_alert_level,
        "alert_triggered": alert_triggered,
        "processing_ms": round(processing_ms, 2),
        "explanation": explanation,
        "explanation_tier": explanation_tier,
        "explanation_model": explanation_model,
    }

    line = json.dumps(entry, ensure_ascii=False)

    try:
        with open(_log_file(), "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError as e:
        _console.error("Failed to write audit log: %s", e)

    level = logging.WARNING if alert_triggered else logging.INFO
    _console.log(
        level,
        "AI|station=%s|score=%.1f|alert=%s|severity=%s|rules=%s|ms=%.1f",
        station_code,
        anomaly_score,
        alert_triggered,
        final_alert_level,
        [r["rule_id"] for r in triggered_rules],
        processing_ms,
    )


def log_alert_dispatched(
    *,
    request_id: str,
    station_code: str,
    alert_level: str,
    anomaly_score: float,
    channels: list[str],
) -> None:
    """Log when an alert is actually dispatched (score > 70)."""
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": "ALERT_DISPATCHED",
        "request_id": request_id,
        "station_code": station_code,
        "alert_level": alert_level,
        "anomaly_score": anomaly_score,
        "channels": channels,
    }
    with open(_log_file(), "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    _console.warning(
        "ALERT DISPATCHED | station=%s | level=%s | score=%.1f | channels=%s",
        station_code, alert_level, anomaly_score, channels,
    )


def read_recent_decisions(limit: int = 100) -> list[dict[str, Any]]:
    """Read the most recent N audit entries from today's log (for dashboard)."""
    path = _log_file()
    if not path.exists():
        return []
    entries = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    # Most recent first
    return list(reversed(entries[-limit:]))
