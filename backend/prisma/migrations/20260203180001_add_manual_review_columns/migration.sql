-- Add manual review fields to voters table
ALTER TABLE "voters" ADD COLUMN IF NOT EXISTS "verification_failure_reason" TEXT;
ALTER TABLE "voters" ADD COLUMN IF NOT EXISTS "manual_review_requested_at" TIMESTAMP(3);
ALTER TABLE "voters" ADD COLUMN IF NOT EXISTS "manual_reviewed_at" TIMESTAMP(3);
ALTER TABLE "voters" ADD COLUMN IF NOT EXISTS "manual_reviewed_by" VARCHAR(100);
ALTER TABLE "voters" ADD COLUMN IF NOT EXISTS "manual_review_notes" TEXT;
