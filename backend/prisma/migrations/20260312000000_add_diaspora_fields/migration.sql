-- AlterTable
ALTER TABLE "polling_stations" ADD COLUMN "is_diaspora" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "polling_stations" ADD COLUMN "country" VARCHAR(100);
