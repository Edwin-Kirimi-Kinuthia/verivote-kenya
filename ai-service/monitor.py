"""
VeriVote Kenya — Continuous Monitoring Engine

Three background asyncio tasks run independently:

  _station_loop   (every 60 s)  — fetch active elections, score every polling station
                                   using Isolation Forest + rule engine, store results
  _integrity_loop (every 300 s) — compare blockchain counts vs homomorphic tally totals
  _security_loop  (every 30 s)  — detect distress clusters, velocity surges, after-hours
                                   voting, and blockchain lag events

All results are persisted to SQLite via storage.py.
Alerts (HIGH/CRITICAL) are printed to stderr and stored for the /reports endpoints.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime
from typing import Any

import httpx
import numpy as np

import storage
from integrity_checker import check_election_integrity, check_active_election_blockchain
from security_monitor import analyze_security
from rule_engine import evaluate as rule_evaluate, Severity

logger = logging.getLogger(__name__)

BACKEND_URL       = os.getenv("BACKEND_URL", "http://localhost:3005")
AI_INTERNAL_KEY   = os.getenv("AI_INTERNAL_KEY", "")

STATION_INTERVAL   = int(os.getenv("MONITOR_INTERVAL_SECONDS",   "60"))
INTEGRITY_INTERVAL = int(os.getenv("INTEGRITY_INTERVAL_SECONDS", "300"))
SECURITY_INTERVAL  = int(os.getenv("SECURITY_INTERVAL_SECONDS",  "30"))

FEATURES = [
    "voting_velocity",
    "temporal_deviation",
    "geographic_cluster_score",
    "repeat_attempt_rate",
    "distress_correlation",
]

# Expected peak vote rate for normalisation (votes/hr → 1.0 at this rate)
# Must match the denormalisation constant used in rule_engine.py and llm_explainer.py (400)
PEAK_RATE = 400.0


class MonitoringEngine:
    """
    Autonomous monitoring engine.  Call await engine.start() from the FastAPI
    lifespan to launch background tasks.
    """

    def __init__(self, model: Any, scaler: Any) -> None:
        self._model  = model
        self._scaler = scaler
        self._status: dict[str, Any] = {
            "running":                False,
            "last_monitor_run":       None,
            "last_integrity_run":     None,
            "last_security_run":      None,
            "monitoring_errors":      0,
            "stations_analyzed":      0,
            "integrity_checks_run":   0,
            "security_checks_run":    0,
        }

    @property
    def status(self) -> dict:
        return dict(self._status)

    async def start(self) -> None:
        """Launch all background monitoring tasks."""
        storage.init_db()
        self._status["running"] = True
        asyncio.create_task(self._station_loop(),   name="station_monitor")
        asyncio.create_task(self._integrity_loop(), name="integrity_monitor")
        asyncio.create_task(self._security_loop(),  name="security_monitor")
        logger.info(
            "Monitoring engine started — intervals: "
            f"station={STATION_INTERVAL}s, integrity={INTEGRITY_INTERVAL}s, "
            f"security={SECURITY_INTERVAL}s"
        )

    # ── Main loops ────────────────────────────────────────────────────────────

    async def _station_loop(self) -> None:
        logger.info("Station monitoring loop active")
        while True:
            try:
                await self._check_stations()
            except Exception:
                logger.exception("Station loop error")
                self._status["monitoring_errors"] += 1
            await asyncio.sleep(STATION_INTERVAL)

    async def _integrity_loop(self) -> None:
        await asyncio.sleep(30)          # stagger startup
        logger.info("Integrity check loop active")
        while True:
            try:
                await self._check_integrity()
            except Exception:
                logger.exception("Integrity loop error")
            await asyncio.sleep(INTEGRITY_INTERVAL)

    async def _security_loop(self) -> None:
        await asyncio.sleep(10)          # stagger startup
        logger.info("Security monitoring loop active")
        while True:
            try:
                await self._check_security()
            except Exception:
                logger.exception("Security loop error")
            await asyncio.sleep(SECURITY_INTERVAL)

    # ── Data fetching ─────────────────────────────────────────────────────────

    async def _fetch(self) -> dict | None:
        if not AI_INTERNAL_KEY:
            logger.warning("AI_INTERNAL_KEY not set — skipping monitoring fetch")
            return None
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{BACKEND_URL}/api/ai-internal/monitoring-data",
                    headers={"X-AI-Service-Key": AI_INTERNAL_KEY},
                )
            if resp.status_code == 200:
                return resp.json()
            logger.warning("Backend monitoring returned %d", resp.status_code)
            return None
        except httpx.RequestError as exc:
            logger.warning("Backend unreachable: %s", exc)
            self._status["monitoring_errors"] += 1
            return None

    # ── Station fraud scoring ─────────────────────────────────────────────────

    async def _check_stations(self) -> None:
        data = await self._fetch()
        if not data:
            return

        ts = datetime.utcnow().isoformat() + "Z"
        processed = 0

        for election in data.get("activeElections", []):
            eid      = election["id"]
            stations = election.get("stations", [])

            # County-level hourly averages for geographic comparison
            county_hours: dict[str, list[int]] = {}
            for st in stations:
                county = st.get("county") or "UNKNOWN"
                county_hours.setdefault(county, []).append(
                    st["stats"].get("votesLastHour", 0)
                )
            county_avg = {
                c: sum(v) / len(v)
                for c, v in county_hours.items()
                if v
            }

            for st in stations:
                sid    = st["id"]
                county = st.get("county") or "UNKNOWN"
                avg    = county_avg.get(county, 0.0)

                features = self._build_features(st, avg)
                score    = self._if_score(features)
                re_out   = rule_evaluate(
                    station_code=sid,
                    voting_velocity=features["voting_velocity"],
                    temporal_deviation=features["temporal_deviation"],
                    geographic_cluster_score=features["geographic_cluster_score"],
                    repeat_attempt_rate=features["repeat_attempt_rate"],
                    distress_correlation=features["distress_correlation"],
                    recent_distress_count=st["stats"].get("distressLast30Min", 0),
                    window_minutes=30,
                    station_hourly_average=avg if avg > 0 else None,
                )
                alert = self._alert_level(score, re_out.overall_severity)
                triggered = [
                    {"rule_id": r.rule_id, "severity": r.severity.value, "description": r.description}
                    for r in re_out.triggered_rules
                ]
                explanation = (
                    f"{alert}: score={score:.1f}"
                    + (f", rules=[{', '.join(r['rule_id'] for r in triggered)}]" if triggered else "")
                )

                storage.save_station_score(
                    ts=ts,
                    election_id=eid,
                    station_id=sid,
                    station_name=st.get("name", ""),
                    county=county,
                    constituency=st.get("constituency", ""),
                    ward=st.get("ward", ""),
                    anomaly_score=score,
                    alert_level=alert,
                    triggered_rules=triggered,
                    features=features,
                    explanation=explanation,
                )
                processed += 1

                if alert in ("CRITICAL", "HIGH"):
                    logger.warning(
                        "[%s] Station %s (%s) | score=%.1f | rules=%s",
                        alert, st.get("name", sid), county, score,
                        [r["rule_id"] for r in triggered],
                    )

        self._status["last_monitor_run"]   = ts
        self._status["stations_analyzed"] += processed
        if processed:
            logger.info("Station monitor: scored %d stations", processed)

    # ── Integrity checks ──────────────────────────────────────────────────────

    async def _check_integrity(self) -> None:
        data = await self._fetch()
        if not data:
            return

        ts    = datetime.utcnow().isoformat() + "Z"
        count = 0

        # Tallied elections — full blockchain vs tally comparison
        for election in data.get("talliedElections", []):
            result = check_election_integrity(election)
            storage.save_integrity_check(
                ts=ts,
                election_id=result.election_id,
                election_name=result.election_name,
                total_votes=result.total_votes,
                blockchain_confirmed=result.blockchain_confirmed,
                blockchain_pending=result.blockchain_pending,
                tally_total=result.tally_total,
                status=result.status,
                details={"findings": result.findings},
            )
            count += 1
            if result.severity in ("CRITICAL", "HIGH"):
                logger.error(
                    "[INTEGRITY %s] %s: %s",
                    result.status, result.election_name,
                    [f["description"] for f in result.findings if f.get("severity") in ("CRITICAL", "HIGH")],
                )

        # Active elections — blockchain lag only
        for election in data.get("activeElections", []):
            result = check_active_election_blockchain(election)
            storage.save_integrity_check(
                ts=ts,
                election_id=result.election_id,
                election_name=result.election_name,
                total_votes=result.total_votes,
                blockchain_confirmed=result.blockchain_confirmed,
                blockchain_pending=result.blockchain_pending,
                tally_total=None,
                status=result.status,
                details={"note": "Active election — full tally check pending ceremony"},
            )
            count += 1

        self._status["last_integrity_run"]   = ts
        self._status["integrity_checks_run"] += count
        if count:
            logger.info("Integrity check: verified %d elections", count)

    # ── Security event analysis ───────────────────────────────────────────────

    async def _check_security(self) -> None:
        data = await self._fetch()
        if not data:
            return

        ts     = datetime.utcnow().isoformat() + "Z"
        events = analyze_security(data)

        for ev in events:
            storage.save_security_event(
                ts=ts,
                event_type=ev.event_type,
                severity=ev.severity,
                election_id=ev.election_id,
                station_id=ev.station_id,
                description=ev.description,
                details=ev.details,
            )

        self._status["last_security_run"]   = ts
        self._status["security_checks_run"] += 1

        for ev in events:
            if ev.severity == "CRITICAL":
                logger.critical("[SECURITY CRITICAL] %s: %s", ev.event_type, ev.description)
            elif ev.severity == "HIGH":
                logger.warning("[SECURITY HIGH] %s: %s", ev.event_type, ev.description)

    # ── Feature engineering ───────────────────────────────────────────────────

    def _build_features(self, station: dict, county_avg_hr: float) -> dict[str, float]:
        s = station["stats"]
        votes_hr   = s.get("votesLastHour", 0)
        votes_30   = s.get("votesLast30Min", 0) or 1
        distress_30 = s.get("distressLast30Min", 0)
        total       = s.get("totalVotes", 0) or 1

        # voting_velocity: normalised to PEAK_RATE
        velocity = min(votes_hr / PEAK_RATE, 1.0)

        # temporal_deviation: how far current rate deviates from county peer average
        if county_avg_hr > 0:
            temporal_dev = min(abs(votes_hr - county_avg_hr) / county_avg_hr, 1.0)
        else:
            temporal_dev = 0.0

        # geographic_cluster_score: how isolated this station's rate is vs peers
        geo_score = min(votes_hr / (county_avg_hr * 3 + 1), 1.0) if county_avg_hr > 0 else 0.0

        # repeat_attempt_rate: lifetime distress density (proxy for repeated suspicious attempts)
        # Uses total votes as denominator — measures cumulative coercion pressure at station
        repeat_rate = min(distress_30 / (total), 1.0)

        # distress_correlation: recent distress density (last 30 min window)
        # Uses 30-min votes as denominator — measures acute/current coercion intensity
        distress_corr = min(distress_30 / votes_30, 1.0)

        return {
            "voting_velocity":         round(velocity, 4),
            "temporal_deviation":      round(temporal_dev, 4),
            "geographic_cluster_score": round(geo_score, 4),
            "repeat_attempt_rate":     round(repeat_rate, 4),
            "distress_correlation":    round(distress_corr, 4),
        }

    def _if_score(self, features: dict) -> float:
        """Isolation Forest → [0, 100], high = anomaly."""
        try:
            X = np.array([[features[f] for f in FEATURES]])
            X_s = self._scaler.transform(X)
            raw = float(self._model.decision_function(X_s)[0])
            clamped = max(-0.6, min(0.4, raw))
            return round((-clamped + 0.6) / 1.0 * 100, 2)
        except Exception as exc:
            logger.error("Isolation Forest scoring failed: %s", exc)
            return 0.0

    @staticmethod
    def _alert_level(score: float, rule_sev: Severity) -> str:
        if rule_sev == Severity.CRITICAL:
            return "CRITICAL"
        if score >= 85 or rule_sev == Severity.HIGH:
            return "HIGH"
        if score >= 70 or rule_sev == Severity.MEDIUM:
            return "MEDIUM"
        if score >= 50 or rule_sev == Severity.LOW:
            return "LOW"
        return "NONE"
