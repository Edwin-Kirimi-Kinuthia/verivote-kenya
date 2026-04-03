"""
VeriVote Kenya — Security Monitor

Detects security compromises and anomalies from live monitoring data.

Checks performed:
  SEC-01  DISTRESS_CLUSTER_STATION  — 3+ distress votes at one station in 30 min
  SEC-02  DISTRESS_CLUSTER_ELECTION — election-wide distress surge in 30 min
  SEC-03  MASS_DISTRESS             — distress rate >0.5% of total election votes
  SEC-04  VELOCITY_SURGE            — station >3× county average votes/hr
  SEC-05  AFTER_HOURS_VOTING        — votes cast outside 06:00–17:00 EAT (03:00–14:00 UTC)
  SEC-06  BLOCKCHAIN_LAG_STATION    — >20% of a station's votes unconfirmed
  SEC-07  BLOCKCHAIN_LAG_ELECTION   — >10% of election votes unconfirmed
  SEC-08  ZERO_BLOCKCHAIN_ELECTION  — election has votes but 0 blockchain confirmations
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

# Kenyan polling hours in UTC (EAT = UTC+3)
# 06:00 EAT = 03:00 UTC,  17:00 EAT = 14:00 UTC
POLL_START_UTC = 3
POLL_END_UTC   = 14
# One-hour grace period before/after polls to avoid flagging votes from the
# closing window that legitimately occurred within polling hours.
_BEFORE_HOURS_UTC = POLL_START_UTC - 1   # 02:00 UTC
_AFTER_HOURS_UTC  = POLL_END_UTC  + 1   # 15:00 UTC


@dataclass
class SecurityEvent:
    event_type:  str
    severity:    str          # NONE | LOW | MEDIUM | HIGH | CRITICAL
    description: str
    election_id: str | None = None
    station_id:  str | None = None
    details:     dict = field(default_factory=dict)
    ts:          str  = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")

    def to_dict(self) -> dict:
        return {
            "ts":          self.ts,
            "event_type":  self.event_type,
            "severity":    self.severity,
            "description": self.description,
            "election_id": self.election_id,
            "station_id":  self.station_id,
            "details":     self.details,
        }


def analyze_security(monitoring_data: dict) -> list[SecurityEvent]:
    """
    Analyse monitoring data and return all security events found.
    monitoring_data is the response from GET /api/ai-internal/monitoring-data.
    """
    events: list[SecurityEvent] = []
    now = datetime.utcnow()
    current_utc_hour = now.hour

    for election in monitoring_data.get("activeElections", []):
        eid   = election["id"]
        ename = election.get("name", eid)
        stats = election.get("electionStats", {})
        stations: list[dict] = election.get("stations", [])

        total_votes     = stats.get("totalVotes", 0)
        distress_total  = stats.get("distressTotal", 0)
        distress_30min  = stats.get("distressLast30Min", 0)
        bc_pending      = stats.get("blockchainPending", 0)
        bc_confirmed    = stats.get("blockchainConfirmed", 0)

        # ── SEC-01a: Any distress vote election-wide (immediate notification) ───
        if distress_30min == 1:
            events.append(SecurityEvent(
                event_type="DISTRESS_VOTE_ELECTION",
                severity="LOW",
                description=(
                    f"{ename}: 1 distress vote detected in last 30 min — "
                    f"voter may be under duress. Admin should follow up."
                ),
                election_id=eid,
                details={"election_name": ename, "distress_last_30min": distress_30min},
            ))
        elif distress_30min == 2:
            events.append(SecurityEvent(
                event_type="DISTRESS_VOTE_ELECTION",
                severity="MEDIUM",
                description=(
                    f"{ename}: 2 distress votes detected in last 30 min — "
                    f"possible pattern. Admin should investigate."
                ),
                election_id=eid,
                details={"election_name": ename, "distress_last_30min": distress_30min},
            ))

        # ── SEC-02: Election-wide distress cluster ────────────────────────────
        if distress_30min >= 5:
            events.append(SecurityEvent(
                event_type="DISTRESS_CLUSTER_ELECTION",
                severity="CRITICAL",
                description=(
                    f"{ename}: {distress_30min} distress votes across election "
                    f"in last 30 min — possible coordinated coercion"
                ),
                election_id=eid,
                details={"election_name": ename, "distress_last_30min": distress_30min},
            ))
        elif distress_30min >= 3:
            events.append(SecurityEvent(
                event_type="DISTRESS_CLUSTER_ELECTION",
                severity="HIGH",
                description=(
                    f"{ename}: {distress_30min} distress votes in last 30 min"
                ),
                election_id=eid,
                details={"election_name": ename, "distress_last_30min": distress_30min},
            ))

        # ── SEC-03: Mass distress rate ────────────────────────────────────────
        if total_votes > 100 and distress_total > 0:
            rate = distress_total / total_votes * 100
            if rate > 2.0:
                events.append(SecurityEvent(
                    event_type="MASS_DISTRESS",
                    severity="CRITICAL",
                    description=(
                        f"{ename}: {distress_total} distress votes = {rate:.2f}% "
                        f"of all votes — organized voter coercion suspected"
                    ),
                    election_id=eid,
                    details={
                        "election_name":  ename,
                        "distress_total": distress_total,
                        "total_votes":    total_votes,
                        "rate_pct":       round(rate, 2),
                    },
                ))
            elif rate > 0.5:
                events.append(SecurityEvent(
                    event_type="MASS_DISTRESS",
                    severity="HIGH",
                    description=(
                        f"{ename}: distress rate {rate:.2f}% exceeds normal threshold"
                    ),
                    election_id=eid,
                    details={
                        "election_name":  ename,
                        "distress_total": distress_total,
                        "total_votes":    total_votes,
                        "rate_pct":       round(rate, 2),
                    },
                ))

        # ── SEC-07: Election-wide blockchain lag ──────────────────────────────
        if total_votes > 100:
            pending_pct = bc_pending / total_votes * 100
            if pending_pct > 30:
                events.append(SecurityEvent(
                    event_type="BLOCKCHAIN_LAG_ELECTION",
                    severity="HIGH",
                    description=(
                        f"{ename}: {bc_pending} votes ({pending_pct:.1f}%) unconfirmed "
                        f"on blockchain — node may be offline"
                    ),
                    election_id=eid,
                    details={
                        "election_name":  ename,
                        "pending_count":  bc_pending,
                        "total_votes":    total_votes,
                        "pending_pct":    round(pending_pct, 1),
                    },
                ))
            elif pending_pct > 10:
                events.append(SecurityEvent(
                    event_type="BLOCKCHAIN_LAG_ELECTION",
                    severity="MEDIUM",
                    description=(
                        f"{ename}: {bc_pending} votes ({pending_pct:.1f}%) awaiting blockchain confirmation"
                    ),
                    election_id=eid,
                    details={
                        "election_name": ename,
                        "pending_count": bc_pending,
                        "pending_pct":   round(pending_pct, 1),
                    },
                ))

        # ── SEC-08: Zero blockchain confirmations ─────────────────────────────
        if total_votes > 20 and bc_confirmed == 0:
            events.append(SecurityEvent(
                event_type="ZERO_BLOCKCHAIN_ELECTION",
                severity="HIGH",
                description=(
                    f"{ename}: {total_votes} votes recorded but NONE confirmed on blockchain — "
                    f"blockchain node appears to be offline"
                ),
                election_id=eid,
                details={"election_name": ename, "total_votes": total_votes},
            ))

        # ── Per-station checks ────────────────────────────────────────────────
        # Build county hourly average for velocity surge detection
        county_hours: dict[str, list[int]] = {}
        for st in stations:
            county = st.get("county") or "UNKNOWN"
            county_hours.setdefault(county, []).append(
                st["stats"].get("votesLastHour", 0)
            )
        county_avg: dict[str, float] = {
            c: sum(vals) / len(vals)
            for c, vals in county_hours.items()
            if vals
        }

        for st in stations:
            sid    = st["id"]
            sname  = st.get("name", sid)
            county = st.get("county") or "UNKNOWN"
            s      = st["stats"]

            station_total   = s.get("totalVotes", 0)
            votes_hour      = s.get("votesLastHour", 0)
            votes_30min     = s.get("votesLast30Min", 0)
            distress_st_30  = s.get("distressLast30Min", 0)
            st_confirmed    = s.get("blockchainConfirmed", 0)
            st_pending      = s.get("blockchainPending", 0)
            avg             = county_avg.get(county, 0.0)

            # SEC-01: Station distress vote detected
            if distress_st_30 >= 3:
                events.append(SecurityEvent(
                    event_type="DISTRESS_CLUSTER_STATION",
                    severity="CRITICAL",
                    description=(
                        f"Station {sname} ({county}): {distress_st_30} distress votes "
                        f"in 30 min — coercion suspected"
                    ),
                    election_id=eid,
                    station_id=sid,
                    details={
                        "station_name":   sname,
                        "county":         county,
                        "distress_count": distress_st_30,
                        "election_name":  ename,
                    },
                ))
            elif distress_st_30 >= 1:
                events.append(SecurityEvent(
                    event_type="DISTRESS_VOTE_STATION",
                    severity="MEDIUM",
                    description=(
                        f"Station {sname} ({county}): {distress_st_30} distress vote(s) "
                        f"in last 30 min — voter may be under duress. Recommend admin follow-up."
                    ),
                    election_id=eid,
                    station_id=sid,
                    details={
                        "station_name":   sname,
                        "county":         county,
                        "distress_count": distress_st_30,
                        "election_name":  ename,
                        "action_required": "Contact voter to confirm vote integrity",
                    },
                ))

            # SEC-04: Velocity surge vs county average
            if avg > 5 and votes_hour > avg * 3:
                ratio = votes_hour / avg
                events.append(SecurityEvent(
                    event_type="VELOCITY_SURGE",
                    severity="HIGH",
                    description=(
                        f"Station {sname}: {votes_hour} votes/hr = {ratio:.1f}× "
                        f"county average ({avg:.0f}) — possible ballot stuffing"
                    ),
                    election_id=eid,
                    station_id=sid,
                    details={
                        "station_name":    sname,
                        "county":          county,
                        "votes_last_hour": votes_hour,
                        "county_avg":      round(avg, 1),
                        "ratio":           round(ratio, 2),
                        "election_name":   ename,
                    },
                ))

            # SEC-05: After-hours voting — only trigger when clearly outside polling hours
            # Uses a grace window to avoid false positives at polling open/close boundaries
            after_hours = current_utc_hour >= _AFTER_HOURS_UTC or current_utc_hour < _BEFORE_HOURS_UTC
            if votes_30min > 5 and after_hours:
                events.append(SecurityEvent(
                    event_type="AFTER_HOURS_VOTING",
                    severity="HIGH",
                    description=(
                        f"Station {sname}: {votes_30min} votes in last 30 min outside "
                        f"polling hours (06:00–17:00 EAT)"
                    ),
                    election_id=eid,
                    station_id=sid,
                    details={
                        "station_name":      sname,
                        "county":            county,
                        "votes_last_30min":  votes_30min,
                        "current_utc_hour":  current_utc_hour,
                        "polling_hours_utc": f"{POLL_START_UTC:02d}:00–{POLL_END_UTC:02d}:00",
                        "election_name":     ename,
                    },
                ))

            # SEC-06: Station blockchain lag
            if station_total > 20 and st_pending > 0:
                st_pend_pct = st_pending / station_total * 100
                if st_pend_pct > 20:
                    events.append(SecurityEvent(
                        event_type="BLOCKCHAIN_LAG_STATION",
                        severity="MEDIUM",
                        description=(
                            f"Station {sname}: {st_pending} votes ({st_pend_pct:.0f}%) "
                            f"unconfirmed on blockchain"
                        ),
                        election_id=eid,
                        station_id=sid,
                        details={
                            "station_name": sname,
                            "pending_count": st_pending,
                            "total_count":   station_total,
                            "pending_pct":   round(st_pend_pct, 1),
                        },
                    ))

    return events
