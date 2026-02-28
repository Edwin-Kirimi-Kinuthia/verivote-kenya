-- CreateEnum
CREATE TYPE "PreferredContact" AS ENUM ('SMS', 'EMAIL');

-- AlterTable
ALTER TABLE "voters" ADD COLUMN     "email" VARCHAR(255),
ADD COLUMN     "fingerprint_captured_at" TIMESTAMP(3),
ADD COLUMN     "fingerprint_hash" VARCHAR(64),
ADD COLUMN     "phone_number" VARCHAR(20),
ADD COLUMN     "preferred_contact" "PreferredContact";
