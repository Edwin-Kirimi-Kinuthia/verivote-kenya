-- Add Persona identity verification fields to voters table
ALTER TABLE "voters" ADD COLUMN IF NOT EXISTS "persona_inquiry_id" VARCHAR(100);
ALTER TABLE "voters" ADD COLUMN IF NOT EXISTS "persona_status" VARCHAR(30);
ALTER TABLE "voters" ADD COLUMN IF NOT EXISTS "persona_verified_at" TIMESTAMP(3);

-- Add unique constraint on persona_inquiry_id
ALTER TABLE "voters" ADD CONSTRAINT "voters_persona_inquiry_id_key" UNIQUE ("persona_inquiry_id");

-- Change default status from REGISTERED to PENDING_VERIFICATION for new voters
ALTER TABLE "voters" ALTER COLUMN "status" SET DEFAULT 'PENDING_VERIFICATION';
