-- Migration: add_otp_and_contact_verification
-- Adds phone/email verified timestamps to voters and creates otp_codes table.

-- ── Voters: contact-verification timestamps ──────────────────────────────────
ALTER TABLE "voters"
  ADD COLUMN IF NOT EXISTS "phone_verified_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3);

-- ── OTP codes table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "otp_codes" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "voter_id"   UUID        NOT NULL,
  "purpose"    VARCHAR(32) NOT NULL,
  "code_hash"  VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "attempts"   INTEGER     NOT NULL DEFAULT 0,
  "used_at"    TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "otp_codes_voter_id_fkey"
    FOREIGN KEY ("voter_id") REFERENCES "voters"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "otp_codes_voter_id_purpose_idx"
  ON "otp_codes"("voter_id", "purpose");
