-- Step 1: Add new enum values to VoterStatus
-- These must be committed before being used, so we add them first
ALTER TYPE "VoterStatus" ADD VALUE IF NOT EXISTS 'PENDING_VERIFICATION';
ALTER TYPE "VoterStatus" ADD VALUE IF NOT EXISTS 'VERIFICATION_FAILED';
