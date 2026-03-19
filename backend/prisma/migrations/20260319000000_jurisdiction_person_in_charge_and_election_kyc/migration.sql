-- Migration: Jurisdiction person-in-charge, polling station link, and per-election KYC flag
--
-- 1. Election.requires_kyc  — controls whether voters must complete Persona KYC.
--    Defaults false; set true for GOVERNMENT elections.
--
-- 2. ElectionJurisdiction.person_in_charge_id — the IEBC officer managing this node.
--    They can view all results below them and declare for positions in their node.
--
-- 3. ElectionJurisdiction.polling_station_id — for POLLING_STATION-level leaf nodes,
--    links to the physical PollingStation record for geolocation and device info.

-- ── 1. Add requires_kyc to elections ─────────────────────────────────────────
ALTER TABLE "elections"
  ADD COLUMN "requires_kyc" BOOLEAN NOT NULL DEFAULT false;

-- Back-fill: GOVERNMENT elections require KYC by default
UPDATE "elections"
  SET "requires_kyc" = true
  WHERE "type" = 'GOVERNMENT';

-- ── 2. Add person_in_charge_id to election_jurisdictions ─────────────────────
ALTER TABLE "election_jurisdictions"
  ADD COLUMN "person_in_charge_id" UUID REFERENCES "iebc_staff"("id") ON DELETE SET NULL;

CREATE INDEX "election_jurisdictions_person_in_charge_id_idx"
  ON "election_jurisdictions"("person_in_charge_id");

-- ── 3. Add polling_station_id to election_jurisdictions ──────────────────────
ALTER TABLE "election_jurisdictions"
  ADD COLUMN "polling_station_id" UUID REFERENCES "polling_stations"("id") ON DELETE SET NULL;

CREATE INDEX "election_jurisdictions_polling_station_id_idx"
  ON "election_jurisdictions"("polling_station_id");
