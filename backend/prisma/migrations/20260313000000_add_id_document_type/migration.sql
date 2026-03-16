-- CreateEnum
CREATE TYPE "IdDocumentType" AS ENUM ('NATIONAL_ID', 'PASSPORT', 'MILITARY_ID', 'ALIEN_ID');

-- AlterTable: add id_document_type column defaulting to NATIONAL_ID for existing rows
ALTER TABLE "voters" ADD COLUMN "id_document_type" "IdDocumentType" NOT NULL DEFAULT 'NATIONAL_ID';
