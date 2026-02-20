-- CreateEnum
CREATE TYPE "AppointmentPurpose" AS ENUM ('REGISTRATION', 'PIN_RESET');

-- AlterTable
ALTER TABLE "manual_review_appointments" ADD COLUMN     "purpose" "AppointmentPurpose" NOT NULL DEFAULT 'REGISTRATION';
