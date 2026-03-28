-- AddValue: DECEASED to VoterStatus enum
ALTER TYPE "VoterStatus" ADD VALUE 'DECEASED';

-- AlterTable: add deceased_at and sbt_revoked_at columns to voters
ALTER TABLE "voters" ADD COLUMN "deceased_at" TIMESTAMP(3);
ALTER TABLE "voters" ADD COLUMN "sbt_revoked_at" TIMESTAMP(3);
