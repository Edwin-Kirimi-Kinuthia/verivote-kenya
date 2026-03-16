-- Remove MILITARY_ID and ALIEN_ID from IdDocumentType enum.
-- PostgreSQL does not support removing enum values directly,
-- so we rename the old type, create the new one, alter the column, then drop the old type.
-- We must drop the column default first because it references the old enum type.

ALTER TABLE "voters" ALTER COLUMN "id_document_type" DROP DEFAULT;

ALTER TYPE "IdDocumentType" RENAME TO "IdDocumentType_old";

CREATE TYPE "IdDocumentType" AS ENUM ('NATIONAL_ID', 'PASSPORT');

ALTER TABLE "voters"
  ALTER COLUMN "id_document_type" TYPE "IdDocumentType"
  USING "id_document_type"::text::"IdDocumentType";

ALTER TABLE "voters" ALTER COLUMN "id_document_type" SET DEFAULT 'NATIONAL_ID';

DROP TYPE "IdDocumentType_old";
