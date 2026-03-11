"""
VeriVote Kenya — Sovereign LLM Explainability Layer
Generates plain-English fraud alerts for IEBC officers using a locally-deployed
open-source LLM (Llama 3.2 via Ollama). Zero data egress — all inference on-premise.

Architecture:
  Tier 1 — Ollama + Llama 3.2 (GPU: 8B model, CPU: 1B model)
  Tier 0 — Template fallback when Ollama is unavailable (graceful degradation)

Sovereignty: No external API calls. Works fully air-gapped.
NIRU B2 (Robustness): System continues operating if LLM is slow or unreachable.
NIRU D2 (Auditability): Every explanation logged with model version and tier used.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:1b")
OLLAMA_TIMEOUT = float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "20"))


# ── Prompt templates ──────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are an AI security analyst for the IEBC (Independent Electoral and Boundaries Commission) of Kenya.
Your role is to explain election anomaly alerts to IEBC security officers in clear, actionable language.
Be concise (2-4 sentences). State what was detected, why it is suspicious, and what action the officer should take.
Do not speculate beyond the data provided. Do not use jargon. Write in English."""

def _build_user_prompt(
    station_code: str,
    anomaly_score: float,
    alert_level: str,
    features: dict[str, float],
    triggered_rules: list[dict[str, Any]],
    station_hourly_average: float | None,
) -> str:
    """Build a structured prompt from anomaly detection results."""
    feature_lines = []
    vel = features.get("voting_velocity", 0)
    if station_hourly_average:
        raw_vel = vel * 400
        ratio = raw_vel / station_hourly_average if station_hourly_average > 0 else 0
        feature_lines.append(f"- Voting velocity: {raw_vel:.0f} votes/hr ({ratio:.1f}× the station average of {station_hourly_average:.0f})")
    else:
        feature_lines.append(f"- Voting velocity (normalised): {vel:.2f}/1.0")

    feature_lines += [
        f"- Temporal deviation (off-hours activity): {features.get('temporal_deviation', 0):.2f}/1.0",
        f"- Geographic cluster score (isolated surge): {features.get('geographic_cluster_score', 0):.2f}/1.0",
        f"- Repeat PIN attempt rate: {features.get('repeat_attempt_rate', 0):.2f}/1.0",
        f"- Distress PIN correlation: {features.get('distress_correlation', 0):.2f}/1.0",
    ]

    rule_lines = []
    for r in triggered_rules:
        rule_lines.append(f"- {r['rule_id']} ({r['severity']}): {r['description']}")

    rules_section = "\n".join(rule_lines) if rule_lines else "- No deterministic rules triggered"

    return f"""Election anomaly detected at polling station {station_code}.

Anomaly score: {anomaly_score:.1f}/100 (alert level: {alert_level})
Alert threshold: 70/100

Sensor readings:
{chr(10).join(feature_lines)}

Triggered security rules:
{rules_section}

Write a 2-4 sentence briefing for the IEBC security officer at this station. Include what action they should take."""


# ── Template fallback (Tier 0) ────────────────────────────────────────────────

def _template_explanation(
    station_code: str,
    anomaly_score: float,
    alert_level: str,
    features: dict[str, float],
    triggered_rules: list[dict[str, Any]],
    station_hourly_average: float | None,
) -> str:
    """
    Rule-based template explanation used when Ollama is unavailable.
    Deterministic, fully auditable, and still actionable.
    """
    primary_rule = triggered_rules[0] if triggered_rules else None
    vel = features.get("voting_velocity", 0)
    distress = features.get("distress_correlation", 0)

    if alert_level == "CRITICAL":
        if distress >= 0.5:
            action = (
                f"CRITICAL ALERT — Station {station_code}: Multiple distress PIN activations detected "
                f"(distress score: {distress:.2f}). This pattern is consistent with organised voter coercion. "
                f"Anomaly score: {anomaly_score:.0f}/100. "
                "Dispatch security personnel to the station immediately and secure the premises."
            )
        elif primary_rule and "VELOCITY" in primary_rule["rule_id"]:
            ratio_str = ""
            if station_hourly_average:
                ratio = (vel * 400) / station_hourly_average
                ratio_str = f" ({ratio:.1f}× the station average)"
            action = (
                f"CRITICAL ALERT — Station {station_code}: Ballot stuffing pattern detected. "
                f"Voting velocity is abnormally high{ratio_str}. "
                f"Anomaly score: {anomaly_score:.0f}/100. "
                "Suspend voting temporarily and conduct an immediate manual count verification."
            )
        else:
            action = (
                f"CRITICAL ALERT — Station {station_code}: Multiple fraud indicators active simultaneously. "
                f"Anomaly score: {anomaly_score:.0f}/100. Rules triggered: {', '.join(r['rule_id'] for r in triggered_rules)}. "
                "Contact the returning officer and request an immediate physical inspection."
            )

    elif alert_level == "HIGH":
        geo = features.get("geographic_cluster_score", 0)
        repeat = features.get("repeat_attempt_rate", 0)
        if geo >= 0.7:
            action = (
                f"HIGH ALERT — Station {station_code}: Isolated geographic surge detected "
                f"(cluster score: {geo:.2f}). This station is processing significantly more votes than "
                f"neighbouring stations in the same county. Anomaly score: {anomaly_score:.0f}/100. "
                "A supervisor should visit the station and verify the voter register against actual attendance."
            )
        elif repeat >= 0.6:
            action = (
                f"HIGH ALERT — Station {station_code}: High rate of repeated PIN attempts detected "
                f"(rate: {repeat:.2f}). This may indicate credential testing or impersonation attempts. "
                f"Anomaly score: {anomaly_score:.0f}/100. "
                "Officers should verify photo ID for all voters and monitor for suspicious behaviour."
            )
        else:
            action = (
                f"HIGH ALERT — Station {station_code}: Suspicious voting pattern detected. "
                f"Anomaly score: {anomaly_score:.0f}/100. "
                "A returning officer should review the station log and increase monitoring frequency."
            )

    elif alert_level == "MEDIUM":
        action = (
            f"MEDIUM ALERT — Station {station_code}: Elevated but not critical anomaly signals detected. "
            f"Anomaly score: {anomaly_score:.0f}/100. No immediate action required, but "
            "this station should be monitored closely for escalation over the next 30 minutes."
        )
    else:
        action = (
            f"Station {station_code}: Voting pattern is within normal parameters. "
            f"Anomaly score: {anomaly_score:.0f}/100. No action required."
        )

    return action


# ── Ollama client (Tier 1) ────────────────────────────────────────────────────

@dataclass
class ExplanationResult:
    explanation: str
    tier: str          # "llm" | "template"
    model: str | None  # e.g. "llama3.2:1b" or None for template
    latency_ms: float
    sovereignty_note: str = "Generated on-premise. No data transmitted externally."


async def explain_anomaly(
    station_code: str,
    anomaly_score: float,
    alert_level: str,
    features: dict[str, float],
    triggered_rules: list[dict[str, Any]],
    station_hourly_average: float | None = None,
) -> ExplanationResult:
    """
    Generate a plain-English explanation for an anomaly detection result.
    Attempts Ollama (Tier 1), falls back to template (Tier 0) on any failure.
    """
    t0 = time.perf_counter()

    # Always skip LLM for NONE/LOW alerts — template is sufficient and faster
    if alert_level in ("NONE", "LOW"):
        template = _template_explanation(
            station_code, anomaly_score, alert_level,
            features, triggered_rules, station_hourly_average,
        )
        return ExplanationResult(
            explanation=template,
            tier="template",
            model=None,
            latency_ms=(time.perf_counter() - t0) * 1000,
        )

    # Try Ollama
    try:
        user_prompt = _build_user_prompt(
            station_code, anomaly_score, alert_level,
            features, triggered_rules, station_hourly_average,
        )
        async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/generate",
                json={
                    "model": OLLAMA_MODEL,
                    "prompt": user_prompt,
                    "system": _SYSTEM_PROMPT,
                    "stream": False,
                    "options": {
                        "temperature": 0.3,    # low temp = consistent, factual
                        "num_predict": 200,    # max tokens (keep it concise)
                        "top_p": 0.9,
                    },
                },
            )
            resp.raise_for_status()
            data = resp.json()
            explanation = data.get("response", "").strip()

            if not explanation:
                raise ValueError("Empty response from Ollama")

            return ExplanationResult(
                explanation=explanation,
                tier="llm",
                model=OLLAMA_MODEL,
                latency_ms=(time.perf_counter() - t0) * 1000,
            )

    except Exception as e:
        # Graceful degradation — log and use template
        print(f"[LLM FALLBACK] Ollama unavailable ({type(e).__name__}: {e}). Using template.")
        template = _template_explanation(
            station_code, anomaly_score, alert_level,
            features, triggered_rules, station_hourly_average,
        )
        return ExplanationResult(
            explanation=template,
            tier="template",
            model=None,
            latency_ms=(time.perf_counter() - t0) * 1000,
        )


async def check_ollama_health() -> dict:
    """Check if Ollama is running and the configured model is available."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            resp.raise_for_status()
            tags = resp.json()
            models = [m["name"] for m in tags.get("models", [])]
            model_available = any(OLLAMA_MODEL in m for m in models)
            return {
                "ollama_running": True,
                "configured_model": OLLAMA_MODEL,
                "model_available": model_available,
                "available_models": models,
                "url": OLLAMA_URL,
            }
    except Exception as e:
        return {
            "ollama_running": False,
            "configured_model": OLLAMA_MODEL,
            "model_available": False,
            "error": str(e),
            "fallback": "template-based explanations active",
            "url": OLLAMA_URL,
        }
