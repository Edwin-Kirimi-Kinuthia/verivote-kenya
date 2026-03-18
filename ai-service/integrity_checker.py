"""
VeriVote Kenya — Blockchain vs Homomorphic Tally Integrity Checker

Compares:
  1. Votes confirmed on blockchain (txHash != null)       ← cryptographic record
  2. Total ballots processed by homomorphic ceremony      ← decrypted tally
  3. Votes recorded in DB (total count)                   ← operational record

A healthy election satisfies:
  blockchain_confirmed ≈ tally_totalBallotsProcessed ≈ db_total_votes

Any significant deviation is flagged as a potential integrity compromise.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

# Thresholds
MAX_PENDING_PCT      = 5.0   # >5% blockchain-pending triggers MEDIUM
HIGH_PENDING_PCT     = 20.0  # >20% triggers HIGH
MAX_DISCREPANCY_PCT  = 0.1   # >0.1% tally vs blockchain mismatch triggers HIGH
CRIT_DISCREPANCY_PCT = 1.0   # >1.0% triggers CRITICAL


def _escalate(current: str, new: str) -> str:
    order = ["NONE", "LOW", "MEDIUM", "HIGH", "CRITICAL"]
    return new if order.index(new) > order.index(current) else current


@dataclass
class IntegrityResult:
    election_id:         str
    election_name:       str
    total_votes:         int
    blockchain_confirmed: int
    blockchain_pending:  int
    tally_total:         int | None
    status:              str          # PASS | PARTIAL | MISMATCH | CRITICAL_MISMATCH | BLOCKCHAIN_LAG | NO_TALLY
    severity:            str          # NONE | LOW | MEDIUM | HIGH | CRITICAL
    findings:            list[dict] = field(default_factory=list)
    ts:                  str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")

    def to_dict(self) -> dict:
        discrepancy = (
            abs(self.blockchain_confirmed - self.tally_total)
            if self.tally_total is not None else None
        )
        discrepancy_pct = (
            discrepancy / self.tally_total * 100
            if (self.tally_total and discrepancy is not None) else None
        )
        pending_pct = (
            self.blockchain_pending / self.total_votes * 100
            if self.total_votes else 0.0
        )
        return {
            "ts":                    self.ts,
            "election_id":           self.election_id,
            "election_name":         self.election_name,
            "total_votes_in_db":     self.total_votes,
            "blockchain_confirmed":  self.blockchain_confirmed,
            "blockchain_pending":    self.blockchain_pending,
            "pending_pct":           round(pending_pct, 2),
            "tally_total":           self.tally_total,
            "discrepancy":           discrepancy,
            "discrepancy_pct":       round(discrepancy_pct, 4) if discrepancy_pct is not None else None,
            "status":                self.status,
            "severity":              self.severity,
            "findings":              self.findings,
            "verdict": _verdict(self.status, self.severity),
        }


def _verdict(status: str, severity: str) -> str:
    if status == "PASS":
        return "VERIFIED — blockchain and tally records are in full agreement."
    if status == "CRITICAL_MISMATCH":
        return "INTEGRITY VIOLATION — critical vote count discrepancy detected. Immediate investigation required."
    if status == "MISMATCH":
        return "WARNING — blockchain and tally totals do not match. Investigation recommended."
    if status == "BLOCKCHAIN_LAG":
        return "PARTIAL — votes pending blockchain confirmation. Monitor until all votes are confirmed."
    if status == "NO_TALLY":
        return "PENDING — homomorphic tally not yet available. Integrity check will run after ceremony."
    return f"STATUS: {status}"


def check_election_integrity(election_data: dict) -> IntegrityResult:
    """
    Verify the integrity of a tallied election.

    election_data structure (from /api/ai-internal/monitoring-data talliedElections):
    {
        "id":               "uuid",
        "name":             "2022 General Election",
        "totalCount":       5000,      # rows in votes table
        "blockchainCount":  4950,      # votes with txHash != null
        "unconfirmedCount": 50,        # votes with txHash == null
        "tallyResult":      {...}      # HomomorphicResult JSON or null
    }
    """
    election_id   = election_data["id"]
    election_name = election_data.get("name", election_id)
    total         = election_data.get("totalCount", 0)
    confirmed     = election_data.get("blockchainCount", 0)
    pending       = election_data.get("unconfirmedCount", 0)
    tally_result  = election_data.get("tallyResult")
    # homomorphicBallotCount: confirmed votes that actually have homomorphic ballot data.
    # This is the correct denominator for comparing against totalBallotsProcessed —
    # some confirmed/blockchain votes may legitimately lack homomorphic data (e.g.
    # cast before the homomorphic feature was live, or via a non-homomorphic path).
    hom_eligible  = election_data.get("homomorphicBallotCount", confirmed)

    findings: list[dict] = []
    severity = "NONE"
    status   = "PASS"

    # ── Extract tally total from homomorphic result ───────────────────────────
    tally_total: int | None = None
    if tally_result and isinstance(tally_result, dict):
        # totalBallotsProcessed is the ground truth from the ceremony
        tally_total = tally_result.get("totalBallotsProcessed")
        if tally_total is not None:
            tally_total = int(tally_total)

    # ── Check 1: Blockchain confirmation lag ──────────────────────────────────
    if total > 0:
        pending_pct = pending / total * 100
        if pending_pct > HIGH_PENDING_PCT:
            findings.append({
                "check":          "BLOCKCHAIN_CONFIRMATION_LAG",
                "severity":       "HIGH",
                "description":    f"{pending} votes ({pending_pct:.1f}%) not confirmed on blockchain — node may be offline",
                "pending_count":  pending,
                "pending_pct":    round(pending_pct, 2),
            })
            severity = _escalate(severity, "HIGH")
            status   = "BLOCKCHAIN_LAG"
        elif pending_pct > MAX_PENDING_PCT:
            findings.append({
                "check":         "BLOCKCHAIN_CONFIRMATION_LAG",
                "severity":      "MEDIUM",
                "description":   f"{pending} votes ({pending_pct:.1f}%) awaiting blockchain confirmation",
                "pending_count": pending,
                "pending_pct":   round(pending_pct, 2),
            })
            severity = _escalate(severity, "MEDIUM")
            if status == "PASS":
                status = "PARTIAL"

    # ── Check 2: Homomorphic-eligible votes vs tally ──────────────────────────
    # We compare tally_total against hom_eligible (confirmed votes WITH homomorphic
    # ballot data), NOT against blockchain_confirmed.  Some confirmed/blockchain votes
    # may lack homomorphic data (e.g. cast before the feature was live); those are
    # handled in Check 3 below as a data-quality flag, not an integrity violation.
    if tally_total is not None:
        discrepancy     = abs(hom_eligible - tally_total)
        discrepancy_pct = discrepancy / hom_eligible * 100 if hom_eligible > 0 else 0.0

        if discrepancy == 0:
            findings.append({
                "check":       "TALLY_VS_HOMOMORPHIC_ELIGIBLE",
                "severity":    "NONE",
                "description": (
                    f"VERIFIED: homomorphic tally ({tally_total}) exactly matches "
                    f"homomorphic-eligible confirmed votes ({hom_eligible})"
                ),
            })
        elif discrepancy_pct <= MAX_DISCREPANCY_PCT:
            findings.append({
                "check":           "TALLY_VS_HOMOMORPHIC_ELIGIBLE",
                "severity":        "LOW",
                "description":     (
                    f"Negligible rounding delta: eligible {hom_eligible} vs tally {tally_total} "
                    f"({discrepancy_pct:.4f}% — within tolerance)"
                ),
                "discrepancy":     discrepancy,
                "discrepancy_pct": round(discrepancy_pct, 4),
            })
            severity = _escalate(severity, "LOW")
        elif discrepancy_pct <= CRIT_DISCREPANCY_PCT:
            findings.append({
                "check":           "TALLY_VS_HOMOMORPHIC_ELIGIBLE",
                "severity":        "HIGH",
                "description":     (
                    f"DISCREPANCY: {hom_eligible} homomorphic-eligible votes but tally "
                    f"processed {tally_total} — {discrepancy} unaccounted ({discrepancy_pct:.2f}%)"
                ),
                "discrepancy":     discrepancy,
                "discrepancy_pct": round(discrepancy_pct, 2),
            })
            severity = _escalate(severity, "HIGH")
            status   = "MISMATCH"
        else:
            findings.append({
                "check":           "TALLY_VS_HOMOMORPHIC_ELIGIBLE",
                "severity":        "CRITICAL",
                "description":     (
                    f"CRITICAL MISMATCH: {hom_eligible} homomorphic-eligible votes but tally "
                    f"only processed {tally_total} — {discrepancy} votes ({discrepancy_pct:.2f}%) "
                    f"not included in ceremony"
                ),
                "discrepancy":     discrepancy,
                "discrepancy_pct": round(discrepancy_pct, 2),
            })
            severity = _escalate(severity, "CRITICAL")
            status   = "CRITICAL_MISMATCH"

        # ── Check 3: Blockchain vs homomorphic-eligible (data quality gap) ────
        # Votes that were blockchain-confirmed but had no homomorphic ballot data
        # could not participate in the ceremony.  This is a data quality concern
        # (e.g. votes cast via a non-homomorphic path or before the feature was live)
        # but it is NOT an integrity violation of the tally itself.
        if confirmed > hom_eligible:
            missing = confirmed - hom_eligible
            missing_pct = missing / confirmed * 100 if confirmed > 0 else 0.0
            findings.append({
                "check":       "HOMOMORPHIC_DATA_COVERAGE",
                "severity":    "MEDIUM",
                "description": (
                    f"{missing} vote(s) ({missing_pct:.1f}%) were blockchain-confirmed but "
                    f"had no homomorphic ballot data — excluded from tally. "
                    f"Verify all votes were cast through the homomorphic voting path."
                ),
                "confirmed":    confirmed,
                "hom_eligible": hom_eligible,
                "missing":      missing,
                "missing_pct":  round(missing_pct, 2),
            })
            severity = _escalate(severity, "MEDIUM")
            if status == "PASS":
                status = "PARTIAL"

    else:
        # No tally yet
        findings.append({
            "check":       "TALLY_VS_BLOCKCHAIN",
            "severity":    "NONE",
            "description": "No homomorphic tally result available yet — check after ceremony",
        })
        if status == "PASS":
            status = "NO_TALLY"

    # ── Check 4: DB total vs blockchain total (large delta = data loss?) ──────
    if total > 0 and confirmed > 0:
        db_delta_pct = abs(total - confirmed) / total * 100
        if db_delta_pct > 10:
            findings.append({
                "check":         "DB_VS_BLOCKCHAIN",
                "severity":      "MEDIUM",
                "description":   (
                    f"DB has {total} votes but blockchain confirms only {confirmed} "
                    f"({db_delta_pct:.1f}% gap) — verify node connectivity"
                ),
                "db_count":      total,
                "chain_count":   confirmed,
                "delta_pct":     round(db_delta_pct, 2),
            })
            severity = _escalate(severity, "MEDIUM")

    # ── Positive confirmation if all clear ────────────────────────────────────
    if status == "PASS" and severity in ("NONE", "LOW") and tally_total is not None:
        findings.insert(0, {
            "check":       "OVERALL_INTEGRITY",
            "severity":    "NONE",
            "description": (
                f"All integrity checks passed for '{election_name}' — "
                f"{confirmed}/{total} blockchain confirmed, tally verified"
            ),
        })

    return IntegrityResult(
        election_id=election_id,
        election_name=election_name,
        total_votes=total,
        blockchain_confirmed=confirmed,
        blockchain_pending=pending,
        tally_total=tally_total,
        status=status,
        severity=severity,
        findings=findings,
    )


def check_active_election_blockchain(election_data: dict) -> IntegrityResult:
    """
    Lighter check for active (not yet tallied) elections — only checks blockchain lag.
    """
    election_id   = election_data["id"]
    election_name = election_data.get("name", election_id)
    stats         = election_data.get("electionStats", {})
    total         = stats.get("totalVotes", 0)
    confirmed     = stats.get("blockchainConfirmed", 0)
    pending       = stats.get("blockchainPending", 0)

    findings: list[dict] = []
    severity = "NONE"
    status   = "PASS"

    if total > 0:
        pending_pct = pending / total * 100
        if pending_pct > HIGH_PENDING_PCT:
            findings.append({
                "check":         "BLOCKCHAIN_LAG",
                "severity":      "HIGH",
                "description":   f"{pending} votes ({pending_pct:.1f}%) unconfirmed — blockchain node may be down",
                "pending_count": pending,
                "pending_pct":   round(pending_pct, 2),
            })
            severity = "HIGH"
            status   = "BLOCKCHAIN_LAG"
        elif pending_pct > MAX_PENDING_PCT:
            findings.append({
                "check":         "BLOCKCHAIN_LAG",
                "severity":      "MEDIUM",
                "description":   f"{pending} votes ({pending_pct:.1f}%) awaiting blockchain confirmation",
                "pending_count": pending,
                "pending_pct":   round(pending_pct, 2),
            })
            severity = "MEDIUM"
            status   = "PARTIAL"
        else:
            findings.append({
                "check":       "BLOCKCHAIN_LAG",
                "severity":    "NONE",
                "description": f"Blockchain confirmation normal: {confirmed}/{total} confirmed ({pending} pending)",
            })

    return IntegrityResult(
        election_id=election_id,
        election_name=election_name,
        total_votes=total,
        blockchain_confirmed=confirmed,
        blockchain_pending=pending,
        tally_total=None,
        status=status,
        severity=severity,
        findings=findings,
    )
