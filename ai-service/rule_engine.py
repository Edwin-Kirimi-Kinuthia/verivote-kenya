"""
Deterministic rule engine — fully auditable, no black-box decisions.

Every rule returns a RuleResult with:
  - triggered: bool
  - severity: CRITICAL | HIGH | MEDIUM | LOW | NONE
  - rule_id: unique string for audit logs
  - description: human-readable explanation
  - evidence: the exact values that triggered the rule

Rules are evaluated in priority order. The highest-severity triggered rule
sets the overall alert level. All triggered rules are logged for audit (D2).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class Severity(str, Enum):
    NONE = "NONE"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

    def __gt__(self, other: "Severity") -> bool:
        order = [s.value for s in Severity]
        return order.index(self.value) > order.index(other.value)


@dataclass
class RuleResult:
    rule_id: str
    triggered: bool
    severity: Severity
    description: str
    evidence: dict[str, Any] = field(default_factory=dict)


@dataclass
class RuleEngineOutput:
    overall_severity: Severity
    triggered_rules: list[RuleResult]
    all_rules: list[RuleResult]
    audit_summary: str


def evaluate(
    *,
    station_code: str,
    voting_velocity: float,
    temporal_deviation: float,
    geographic_cluster_score: float,
    repeat_attempt_rate: float,
    distress_correlation: float,
    recent_distress_count: int = 0,
    window_minutes: int = 30,
    station_hourly_average: float | None = None,
) -> RuleEngineOutput:
    """
    Evaluate all deterministic rules against the current observation.

    Args:
        station_code:            IEBC station code (for audit trail)
        voting_velocity:         normalised votes/hr (0-1), where 1.0 ≈ 400 votes/hr
        temporal_deviation:      normalised deviation from expected hourly pattern (0-1)
        geographic_cluster_score: normalised station surge vs county avg (0-1)
        repeat_attempt_rate:     normalised failed-PIN ratio before successful vote (0-1)
        distress_correlation:    normalised distress flag density in last 60 min (0-1)
        recent_distress_count:   raw count of distress votes at this station in window
        window_minutes:          time window for distress count (default 30 min)
        station_hourly_average:  historical avg votes/hr for this station (raw)
    """

    results: list[RuleResult] = []

    # ── R01: Distress cluster — CRITICAL ────────────────────────────────────
    # 3+ distress votes at same station within 30 minutes = likely organised coercion
    r01 = RuleResult(
        rule_id="R01_DISTRESS_CLUSTER",
        triggered=recent_distress_count >= 3,
        severity=Severity.CRITICAL if recent_distress_count >= 3 else Severity.NONE,
        description=(
            f"{recent_distress_count} distress PIN activations at station {station_code} "
            f"within {window_minutes} minutes — possible organised coercion event"
        ),
        evidence={
            "recent_distress_count": recent_distress_count,
            "window_minutes": window_minutes,
            "threshold": 3,
        },
    )
    results.append(r01)

    # ── R02: Extreme distress correlation — CRITICAL ─────────────────────────
    r02 = RuleResult(
        rule_id="R02_DISTRESS_CORRELATION_EXTREME",
        triggered=distress_correlation >= 0.80,
        severity=Severity.CRITICAL if distress_correlation >= 0.80 else Severity.NONE,
        description=(
            f"Distress correlation score {distress_correlation:.2f} exceeds critical "
            f"threshold (0.80) at station {station_code}"
        ),
        evidence={
            "distress_correlation": round(distress_correlation, 4),
            "threshold": 0.80,
        },
    )
    results.append(r02)

    # ── R03: Velocity 3× average — HIGH ─────────────────────────────────────
    velocity_ratio = None
    if station_hourly_average and station_hourly_average > 0:
        raw_velocity = voting_velocity * 400  # denormalise: 1.0 = 400 votes/hr
        velocity_ratio = raw_velocity / station_hourly_average
        vel_triggered = velocity_ratio >= 3.0
        vel_sev = Severity.HIGH if vel_triggered else Severity.NONE
        vel_desc = (
            f"Voting velocity {raw_velocity:.0f} votes/hr is {velocity_ratio:.1f}× "
            f"the station average ({station_hourly_average:.0f} votes/hr)"
        )
        vel_evidence = {
            "current_votes_per_hour": round(raw_velocity, 1),
            "station_average": round(station_hourly_average, 1),
            "ratio": round(velocity_ratio, 2),
            "threshold_ratio": 3.0,
        }
    else:
        # Fallback: use normalised velocity threshold
        vel_triggered = voting_velocity >= 0.75
        vel_sev = Severity.HIGH if vel_triggered else Severity.NONE
        vel_desc = (
            f"Normalised voting velocity {voting_velocity:.2f} exceeds HIGH threshold (0.75)"
        )
        vel_evidence = {
            "voting_velocity_normalised": round(voting_velocity, 4),
            "threshold": 0.75,
        }

    r03 = RuleResult(
        rule_id="R03_VELOCITY_SURGE",
        triggered=vel_triggered,
        severity=vel_sev,
        description=vel_desc,
        evidence=vel_evidence,
    )
    results.append(r03)

    # ── R04: Geographic isolation surge — HIGH ───────────────────────────────
    r04 = RuleResult(
        rule_id="R04_GEOGRAPHIC_SURGE",
        triggered=geographic_cluster_score >= 0.80,
        severity=Severity.HIGH if geographic_cluster_score >= 0.80 else Severity.NONE,
        description=(
            f"Station {station_code} geographic cluster score {geographic_cluster_score:.2f} "
            f"indicates isolated surge vs county average"
        ),
        evidence={
            "geographic_cluster_score": round(geographic_cluster_score, 4),
            "threshold": 0.80,
        },
    )
    results.append(r04)

    # ── R05: High repeat PIN attempts — HIGH ─────────────────────────────────
    r05 = RuleResult(
        rule_id="R05_REPEAT_PIN_ATTEMPTS",
        triggered=repeat_attempt_rate >= 0.70,
        severity=Severity.HIGH if repeat_attempt_rate >= 0.70 else Severity.NONE,
        description=(
            f"Repeat PIN attempt rate {repeat_attempt_rate:.2f} suggests credential "
            f"testing or ghost-voter registration at station {station_code}"
        ),
        evidence={
            "repeat_attempt_rate": round(repeat_attempt_rate, 4),
            "threshold": 0.70,
        },
    )
    results.append(r05)

    # ── R06: Temporal anomaly — MEDIUM ───────────────────────────────────────
    r06 = RuleResult(
        rule_id="R06_TEMPORAL_ANOMALY",
        triggered=temporal_deviation >= 0.70,
        severity=Severity.MEDIUM if temporal_deviation >= 0.70 else Severity.NONE,
        description=(
            f"Temporal deviation {temporal_deviation:.2f} — activity concentrated "
            f"outside expected voting hours at station {station_code}"
        ),
        evidence={
            "temporal_deviation": round(temporal_deviation, 4),
            "threshold": 0.70,
        },
    )
    results.append(r06)

    # ── R07: Combined velocity + distress — CRITICAL ─────────────────────────
    r07_triggered = voting_velocity >= 0.60 and distress_correlation >= 0.50
    r07 = RuleResult(
        rule_id="R07_VELOCITY_DISTRESS_COMBINED",
        triggered=r07_triggered,
        severity=Severity.CRITICAL if r07_triggered else Severity.NONE,
        description=(
            f"Station {station_code}: elevated velocity ({voting_velocity:.2f}) combined "
            f"with elevated distress ({distress_correlation:.2f}) — high-probability coercion"
        ),
        evidence={
            "voting_velocity": round(voting_velocity, 4),
            "distress_correlation": round(distress_correlation, 4),
            "velocity_threshold": 0.60,
            "distress_threshold": 0.50,
        },
    )
    results.append(r07)

    # ── R08: Moderate multi-signal — MEDIUM ──────────────────────────────────
    signals_elevated = sum([
        voting_velocity >= 0.50,
        temporal_deviation >= 0.50,
        geographic_cluster_score >= 0.50,
        repeat_attempt_rate >= 0.40,
        distress_correlation >= 0.30,
    ])
    r08 = RuleResult(
        rule_id="R08_MULTI_SIGNAL",
        triggered=signals_elevated >= 3,
        severity=Severity.MEDIUM if signals_elevated >= 3 else Severity.NONE,
        description=(
            f"{signals_elevated}/5 signals are elevated at station {station_code} "
            f"— pattern warrants monitoring"
        ),
        evidence={
            "signals_elevated": signals_elevated,
            "threshold": 3,
            "voting_velocity": round(voting_velocity, 4),
            "temporal_deviation": round(temporal_deviation, 4),
            "geographic_cluster_score": round(geographic_cluster_score, 4),
            "repeat_attempt_rate": round(repeat_attempt_rate, 4),
            "distress_correlation": round(distress_correlation, 4),
        },
    )
    results.append(r08)

    # ── Aggregate ────────────────────────────────────────────────────────────
    triggered = [r for r in results if r.triggered]
    overall = Severity.NONE
    for r in triggered:
        if r.severity > overall:
            overall = r.severity

    audit_parts = [f"Station={station_code} | Rules evaluated: {len(results)}"]
    if triggered:
        audit_parts.append(f"Triggered: {[r.rule_id for r in triggered]}")
        audit_parts.append(f"Overall severity: {overall.value}")
    else:
        audit_parts.append("No rules triggered — NORMAL")

    return RuleEngineOutput(
        overall_severity=overall,
        triggered_rules=triggered,
        all_rules=results,
        audit_summary=" | ".join(audit_parts),
    )
