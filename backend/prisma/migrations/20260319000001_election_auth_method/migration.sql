-- Migration: Replace requiresKyc with AuthMethod enum + allowedDomains
--
-- AuthMethod controls how voters verify their identity during registration:
--   PERSONA_KYC  — Full Persona identity scan (national ID / passport photo)
--   EMAIL_DOMAIN — Voter email must match allowed domain(s), OTP verified
--   OTP_ONLY     — Any email/phone, OTP verified (no document check)
--
-- allowedDomains is a text array used with EMAIL_DOMAIN to restrict
-- registration to voters whose email ends with one of the listed domains
-- (e.g. ["uon.ac.ke", "ku.ac.ke"] for a multi-institution election).

-- ── 1. Create AuthMethod enum ─────────────────────────────────────────────────
CREATE TYPE "AuthMethod" AS ENUM ('PERSONA_KYC', 'EMAIL_DOMAIN', 'OTP_ONLY');

-- ── 2. Add auth_method column (default OTP_ONLY) ──────────────────────────────
ALTER TABLE "elections"
  ADD COLUMN "auth_method" "AuthMethod" NOT NULL DEFAULT 'OTP_ONLY';

-- ── 3. Back-fill: GOVERNMENT elections → PERSONA_KYC ─────────────────────────
UPDATE "elections"
  SET "auth_method" = 'PERSONA_KYC'
  WHERE "type" = 'GOVERNMENT';

-- ── 4. Add allowed_domains column ────────────────────────────────────────────
ALTER TABLE "elections"
  ADD COLUMN "allowed_domains" TEXT[] NOT NULL DEFAULT '{}';

-- ── 5. Drop the old requires_kyc column ──────────────────────────────────────
ALTER TABLE "elections"
  DROP COLUMN IF EXISTS "requires_kyc";
