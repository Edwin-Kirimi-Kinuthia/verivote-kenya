-- AlterTable
ALTER TABLE "manual_review_appointments" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "voters" ADD COLUMN     "pin_last_reset_at" TIMESTAMP(3),
ADD COLUMN     "pin_reset_inquiry_id" VARCHAR(100),
ADD COLUMN     "pin_reset_requested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pin_reset_requested_at" TIMESTAMP(3);
