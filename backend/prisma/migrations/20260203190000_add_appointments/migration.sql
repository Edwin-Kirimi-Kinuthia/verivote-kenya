-- Create AppointmentStatus enum
CREATE TYPE "AppointmentStatus" AS ENUM ('AVAILABLE', 'BOOKED', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- Create manual_review_appointments table
CREATE TABLE "manual_review_appointments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 15,
    "polling_station_id" UUID NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'AVAILABLE',
    "voter_id" UUID,
    "assigned_officer_id" VARCHAR(100),
    "assigned_officer_name" VARCHAR(255),
    "booked_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "manual_review_appointments_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on voter_id
CREATE UNIQUE INDEX "manual_review_appointments_voter_id_key" ON "manual_review_appointments"("voter_id");

-- Create indexes
CREATE INDEX "manual_review_appointments_polling_station_id_idx" ON "manual_review_appointments"("polling_station_id");
CREATE INDEX "manual_review_appointments_scheduled_at_idx" ON "manual_review_appointments"("scheduled_at");
CREATE INDEX "manual_review_appointments_status_idx" ON "manual_review_appointments"("status");
CREATE INDEX "manual_review_appointments_voter_id_idx" ON "manual_review_appointments"("voter_id");

-- Add foreign key constraints
ALTER TABLE "manual_review_appointments" ADD CONSTRAINT "manual_review_appointments_polling_station_id_fkey" FOREIGN KEY ("polling_station_id") REFERENCES "polling_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "manual_review_appointments" ADD CONSTRAINT "manual_review_appointments_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "voters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
