-- AlterTable: add normal_pin_hash, distress_pin_hash, pin_set_at to voters
ALTER TABLE "voters" ADD COLUMN "normal_pin_hash" VARCHAR(255);
ALTER TABLE "voters" ADD COLUMN "distress_pin_hash" VARCHAR(255);
ALTER TABLE "voters" ADD COLUMN "pin_set_at" TIMESTAMP(3);
