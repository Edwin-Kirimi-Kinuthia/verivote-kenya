"""
SQLite-backed storage for monitoring results, integrity checks, and security events.
All writes are thread-safe. The DB lives at logs/monitoring.db.
"""
from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "logs" / "monitoring.db"
_lock = threading.Lock()


def init_db() -> None:
    DB_PATH.parent.mkdir(exist_ok=True)
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript("""
            -- Per-station fraud scores from Isolation Forest + rule engine
            CREATE TABLE IF NOT EXISTS station_scores (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ts          TEXT NOT NULL,
                election_id TEXT,
                station_id  TEXT,
                station_name TEXT,
                county      TEXT,
                constituency TEXT,
                ward        TEXT,
                anomaly_score REAL,
                alert_level TEXT,
                triggered_rules TEXT,   -- JSON list
                features    TEXT,       -- JSON dict
                explanation TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_ss_ts      ON station_scores(ts DESC);
            CREATE INDEX IF NOT EXISTS idx_ss_station ON station_scores(station_id, ts DESC);
            CREATE INDEX IF NOT EXISTS idx_ss_election ON station_scores(election_id, ts DESC);
            CREATE INDEX IF NOT EXISTS idx_ss_alert   ON station_scores(alert_level, ts DESC);

            -- Blockchain vs homomorphic tally integrity checks
            CREATE TABLE IF NOT EXISTS integrity_checks (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                ts                   TEXT NOT NULL,
                election_id          TEXT NOT NULL,
                election_name        TEXT,
                total_votes          INTEGER,
                blockchain_confirmed INTEGER,
                blockchain_pending   INTEGER,
                tally_total          INTEGER,
                discrepancy          INTEGER,
                discrepancy_pct      REAL,
                status               TEXT,   -- PASS | PARTIAL | MISMATCH | CRITICAL_MISMATCH | BLOCKCHAIN_LAG | NO_TALLY
                details              TEXT    -- JSON
            );
            CREATE INDEX IF NOT EXISTS idx_ic_ts       ON integrity_checks(ts DESC);
            CREATE INDEX IF NOT EXISTS idx_ic_election ON integrity_checks(election_id, ts DESC);
            CREATE INDEX IF NOT EXISTS idx_ic_status   ON integrity_checks(status, ts DESC);

            -- Security events (distress clusters, velocity surges, after-hours, etc.)
            CREATE TABLE IF NOT EXISTS security_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ts          TEXT NOT NULL,
                event_type  TEXT NOT NULL,
                severity    TEXT NOT NULL,
                election_id TEXT,
                station_id  TEXT,
                description TEXT,
                details     TEXT    -- JSON
            );
            CREATE INDEX IF NOT EXISTS idx_se_ts       ON security_events(ts DESC);
            CREATE INDEX IF NOT EXISTS idx_se_type     ON security_events(event_type, ts DESC);
            CREATE INDEX IF NOT EXISTS idx_se_severity ON security_events(severity, ts DESC);
        """)


# ── Writes ────────────────────────────────────────────────────────────────────

def save_station_score(
    ts: str, election_id: str, station_id: str, station_name: str,
    county: str, constituency: str, ward: str,
    anomaly_score: float, alert_level: str,
    triggered_rules: list, features: dict, explanation: str,
) -> None:
    with _lock, sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """INSERT INTO station_scores
               (ts, election_id, station_id, station_name, county, constituency, ward,
                anomaly_score, alert_level, triggered_rules, features, explanation)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (ts, election_id, station_id, station_name, county, constituency, ward,
             anomaly_score, alert_level,
             json.dumps(triggered_rules), json.dumps(features), explanation),
        )


def save_integrity_check(
    ts: str, election_id: str, election_name: str,
    total_votes: int, blockchain_confirmed: int, blockchain_pending: int,
    tally_total: int | None, status: str, details: dict,
) -> None:
    discrepancy = abs(blockchain_confirmed - (tally_total or 0)) if tally_total is not None else None
    discrepancy_pct = (discrepancy / tally_total * 100) if (tally_total and discrepancy is not None) else None
    with _lock, sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """INSERT INTO integrity_checks
               (ts, election_id, election_name, total_votes, blockchain_confirmed,
                blockchain_pending, tally_total, discrepancy, discrepancy_pct, status, details)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (ts, election_id, election_name, total_votes, blockchain_confirmed,
             blockchain_pending, tally_total, discrepancy, discrepancy_pct,
             status, json.dumps(details)),
        )


def save_security_event(
    ts: str, event_type: str, severity: str,
    election_id: str | None, station_id: str | None,
    description: str, details: dict,
) -> None:
    with _lock, sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """INSERT INTO security_events
               (ts, event_type, severity, election_id, station_id, description, details)
               VALUES (?,?,?,?,?,?,?)""",
            (ts, event_type, severity, election_id, station_id,
             description, json.dumps(details)),
        )


# ── Reads ─────────────────────────────────────────────────────────────────────

def _parse_rows(rows: list) -> list[dict]:
    result = []
    for r in rows:
        d = dict(r)
        for key in ("triggered_rules", "features", "details"):
            if key in d and isinstance(d[key], str):
                try:
                    d[key] = json.loads(d[key])
                except Exception:
                    pass
        result.append(d)
    return result


def get_latest_station_scores(limit: int = 100, alert_level: str | None = None) -> list[dict]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        if alert_level:
            rows = conn.execute(
                "SELECT * FROM station_scores WHERE alert_level=? ORDER BY ts DESC LIMIT ?",
                (alert_level, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM station_scores ORDER BY ts DESC LIMIT ?", (limit,),
            ).fetchall()
    return _parse_rows(rows)


def get_station_history(station_id: str, limit: int = 50) -> list[dict]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM station_scores WHERE station_id=? ORDER BY ts DESC LIMIT ?",
            (station_id, limit),
        ).fetchall()
    return _parse_rows(rows)


def get_latest_integrity_checks(limit: int = 50) -> list[dict]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "SELECT * FROM integrity_checks ORDER BY ts DESC LIMIT ?", (limit,),
        ).fetchall()
    return _parse_rows(rows)


def get_latest_security_events(
    limit: int = 100,
    severity: str | None = None,
    hours: int | None = None,
) -> list[dict]:
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        where_clauses: list[str] = []
        params: list = []
        if severity:
            where_clauses.append("severity=?")
            params.append(severity)
        if hours is not None:
            where_clauses.append(f"ts > datetime('now', ? || ' hours')")
            params.append(f"-{hours}")
        where = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
        params.append(limit)
        rows = conn.execute(
            f"SELECT * FROM security_events {where} ORDER BY ts DESC LIMIT ?",
            params,
        ).fetchall()
    return _parse_rows(rows)


def get_fraud_summary(hours: int = 24) -> dict:
    """Aggregate fraud scores for the last N hours."""
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute(
            """SELECT
                 COUNT(*)                                              AS total_checks,
                 ROUND(AVG(anomaly_score), 2)                         AS avg_score,
                 ROUND(MAX(anomaly_score), 2)                         AS max_score,
                 SUM(CASE WHEN alert_level='CRITICAL' THEN 1 ELSE 0 END) AS critical_count,
                 SUM(CASE WHEN alert_level='HIGH'     THEN 1 ELSE 0 END) AS high_count,
                 SUM(CASE WHEN alert_level='MEDIUM'   THEN 1 ELSE 0 END) AS medium_count,
                 SUM(CASE WHEN alert_level IN ('NONE','LOW') THEN 1 ELSE 0 END) AS normal_count,
                 COUNT(DISTINCT station_id)                            AS stations_monitored,
                 COUNT(DISTINCT election_id)                           AS elections_monitored
               FROM station_scores
               WHERE ts > datetime('now', ? || ' hours')""",
            (f"-{hours}",),
        ).fetchone()
    return {
        "total_checks":        row[0] or 0,
        "avg_score":           row[1] or 0.0,
        "max_score":           row[2] or 0.0,
        "critical_count":      row[3] or 0,
        "high_count":          row[4] or 0,
        "medium_count":        row[5] or 0,
        "normal_count":        row[6] or 0,
        "stations_monitored":  row[7] or 0,
        "elections_monitored": row[8] or 0,
    }


def get_top_risk_stations(limit: int = 10, hours: int = 24) -> list[dict]:
    """Return stations with the highest recent anomaly scores."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT station_id, station_name, county, election_id,
                      MAX(anomaly_score) AS peak_score,
                      AVG(anomaly_score) AS avg_score,
                      MAX(alert_level)   AS worst_alert,
                      COUNT(*)           AS check_count
               FROM station_scores
               WHERE ts > datetime('now', ? || ' hours')
               GROUP BY station_id, station_name, county, election_id
               ORDER BY peak_score DESC
               LIMIT ?""",
            (f"-{hours}", limit),
        ).fetchall()
    return [dict(r) for r in rows]
