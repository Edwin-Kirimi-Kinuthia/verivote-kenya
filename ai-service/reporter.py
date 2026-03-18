"""
VeriVote Kenya — Report Generator

Produces structured reports from stored monitoring data:
  - Fraud activity report   (station anomaly scores + top-risk stations)
  - Integrity check report  (blockchain vs tally comparison)
  - Security events report  (all detected security events)
  - System health report    (combined overview)
"""
from __future__ import annotations

from datetime import datetime

import storage


def generate_fraud_report(hours: int = 24) -> dict:
    """Fraud activity report for the last N hours."""
    summary        = storage.get_fraud_summary(hours)
    top_risk       = storage.get_top_risk_stations(limit=15, hours=hours)
    recent_scores  = storage.get_latest_station_scores(limit=20, alert_level=None)

    # Separate high/critical from normal
    alerts = [s for s in recent_scores if s.get("alert_level") in ("CRITICAL", "HIGH", "MEDIUM")]

    return {
        "report_type":        "FRAUD_ACTIVITY",
        "generated_at":       datetime.utcnow().isoformat() + "Z",
        "period_hours":       hours,
        "summary":            summary,
        "top_risk_stations":  top_risk,
        "recent_alerts":      alerts[:20],
        "recommendation":     _fraud_recommendation(summary),
        "sovereignty_note":   "All analysis performed on-premise. No data transmitted externally.",
    }


def generate_integrity_report() -> dict:
    """Blockchain vs homomorphic tally integrity report."""
    checks = storage.get_latest_integrity_checks(limit=30)

    mismatches = [c for c in checks if c.get("status") in ("MISMATCH", "CRITICAL_MISMATCH")]
    lags       = [c for c in checks if c.get("status") in ("BLOCKCHAIN_LAG", "PARTIAL")]
    passes     = [c for c in checks if c.get("status") == "PASS"]

    # Worst status across all checks
    if any(c.get("status") == "CRITICAL_MISMATCH" for c in checks):
        overall_status = "CRITICAL"
    elif mismatches:
        overall_status = "WARNING"
    elif lags:
        overall_status = "PARTIAL"
    elif passes:
        overall_status = "PASS"
    else:
        overall_status = "NO_DATA"

    return {
        "report_type":    "INTEGRITY_CHECK",
        "generated_at":   datetime.utcnow().isoformat() + "Z",
        "overall_status": overall_status,
        "summary": {
            "checks_performed": len(checks),
            "passed":           len(passes),
            "mismatches":       len(mismatches),
            "lags":             len(lags),
        },
        "mismatches":     mismatches[:10],
        "lags":           lags[:10],
        "recent_checks":  checks[:15],
        "interpretation": _integrity_interpretation(overall_status, mismatches, lags),
        "sovereignty_note": "Cryptographic integrity verified on-premise using blockchain and homomorphic tally records.",
    }


def generate_security_report(hours: int = 24) -> dict:
    """Security events report for the last N hours."""
    all_events = storage.get_latest_security_events(limit=200, hours=hours)

    critical = [e for e in all_events if e.get("severity") == "CRITICAL"]
    high     = [e for e in all_events if e.get("severity") == "HIGH"]
    medium   = [e for e in all_events if e.get("severity") == "MEDIUM"]

    # Group by event type
    by_type: dict[str, int] = {}
    for e in all_events:
        t = e.get("event_type", "UNKNOWN")
        by_type[t] = by_type.get(t, 0) + 1

    overall_severity = (
        "CRITICAL" if critical else
        "HIGH"     if high     else
        "MEDIUM"   if medium   else
        "NONE"
    )

    return {
        "report_type":      "SECURITY_EVENTS",
        "generated_at":     datetime.utcnow().isoformat() + "Z",
        "overall_severity": overall_severity,
        "event_counts": {
            "critical": len(critical),
            "high":     len(high),
            "medium":   len(medium),
            "total":    len(all_events),
        },
        "events_by_type":  by_type,
        "critical_events": critical[:20],
        "high_events":     high[:20],
        "all_recent":      all_events[:50],
        "action_required": _security_action(overall_severity, critical, high),
        "sovereignty_note": "Security analysis performed on-premise using live election telemetry.",
    }


def generate_system_health(monitor_status: dict) -> dict:
    """Combined system health overview."""
    fraud_summary  = storage.get_fraud_summary(hours=1)
    recent_integrity = storage.get_latest_integrity_checks(limit=5)
    recent_security  = storage.get_latest_security_events(limit=10)

    critical_security = [e for e in recent_security if e.get("severity") == "CRITICAL"]
    integrity_issues  = [c for c in recent_integrity if c.get("status") not in ("PASS", "NO_TALLY")]

    # Overall health status
    if critical_security or any(c.get("status") == "CRITICAL_MISMATCH" for c in recent_integrity):
        health = "CRITICAL"
    elif fraud_summary["critical_count"] > 0 or fraud_summary["high_count"] > 0:
        health = "WARNING"
    elif fraud_summary["medium_count"] > 0 or integrity_issues:
        health = "ELEVATED"
    else:
        health = "HEALTHY"

    return {
        "report_type":    "SYSTEM_HEALTH",
        "generated_at":   datetime.utcnow().isoformat() + "Z",
        "health_status":  health,
        "monitoring": {
            "running":                monitor_status.get("running", False),
            "last_station_check":     monitor_status.get("last_monitor_run"),
            "last_integrity_check":   monitor_status.get("last_integrity_run"),
            "last_security_check":    monitor_status.get("last_security_run"),
            "stations_analyzed_total": monitor_status.get("stations_analyzed", 0),
            "integrity_checks_total":  monitor_status.get("integrity_checks_run", 0),
            "monitoring_errors":       monitor_status.get("monitoring_errors", 0),
        },
        "last_hour_fraud": fraud_summary,
        "recent_integrity_issues": integrity_issues,
        "recent_critical_security": critical_security,
        "sovereignty_note": "VeriVote AI monitoring — 100% on-premise, no external API calls.",
    }


# ── Private helpers ───────────────────────────────────────────────────────────

def _fraud_recommendation(summary: dict) -> str:
    if summary["critical_count"] > 0:
        return (
            f"IMMEDIATE ACTION REQUIRED: {summary['critical_count']} critical fraud alert(s) detected. "
            f"Contact IEBC Security Coordinator and deploy field response teams to flagged stations."
        )
    if summary["high_count"] > 0:
        return (
            f"URGENT: {summary['high_count']} high-severity anomaly(s) detected. "
            f"Returning Officers should physically inspect flagged stations and verify voter rolls."
        )
    if summary["medium_count"] > 0:
        return (
            f"MONITOR: {summary['medium_count']} medium-level anomaly(s) detected. "
            f"Increased observation recommended at flagged stations."
        )
    return "System nominal — no significant fraud patterns detected in the monitoring period."


def _integrity_interpretation(status: str, mismatches: list, lags: list) -> str:
    if status == "CRITICAL":
        return (
            "INTEGRITY VIOLATION: Critical vote count discrepancy between blockchain and "
            "homomorphic tally. Results cannot be certified until discrepancy is resolved. "
            "Escalate to IEBC Chairperson and legal team immediately."
        )
    if status == "WARNING":
        n = len(mismatches)
        return (
            f"{n} election(s) show a discrepancy between blockchain records and homomorphic tally. "
            f"Investigation required before results can be formally declared."
        )
    if status == "PARTIAL":
        return (
            f"{len(lags)} election(s) require follow-up: some votes could not be "
            f"fully verified. Possible causes: blockchain confirmation delay, or votes "
            f"cast outside the homomorphic ballot path. The tally itself is intact — "
            f"review the findings for each flagged election."
        )
    if status == "PASS":
        return "All election integrity checks passed — blockchain and tally records are in full agreement."
    return "No integrity check data available yet — checks run every 5 minutes during active elections."


def _security_action(severity: str, critical: list, high: list) -> str:
    if severity == "CRITICAL":
        types = list({e.get("event_type") for e in critical})
        return (
            f"IMMEDIATE RESPONSE REQUIRED: Critical security events detected "
            f"({', '.join(types)}). Notify IEBC Security Coordinator and activate incident response."
        )
    if severity == "HIGH":
        types = list({e.get("event_type") for e in high})
        return (
            f"URGENT: High-severity events detected ({', '.join(types)}). "
            f"Returning Officers should investigate flagged stations."
        )
    if severity == "MEDIUM":
        return "MONITOR: Medium-severity security events logged. Continue monitoring for escalation."
    return "No active security threats detected."
