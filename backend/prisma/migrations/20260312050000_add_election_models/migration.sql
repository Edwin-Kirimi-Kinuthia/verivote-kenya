-- CreateEnum
CREATE TYPE "ElectionType" AS ENUM ('GOVERNMENT', 'INSTITUTIONAL', 'CORPORATE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ElectionStatus" AS ENUM ('DRAFT', 'NOMINATIONS', 'ACTIVE', 'CLOSED', 'TALLIED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PositionScope" AS ENUM ('NATIONAL', 'COUNTY', 'CONSTITUENCY', 'WARD', 'CUSTOM');

-- CreateTable
CREATE TABLE "elections" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "type" "ElectionType" NOT NULL,
    "status" "ElectionStatus" NOT NULL DEFAULT 'DRAFT',
    "org_name" VARCHAR(255),
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "elections_status_idx" ON "elections"("status");
CREATE INDEX "elections_type_idx" ON "elections"("type");

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL,
    "election_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "scope" "PositionScope" NOT NULL,
    "scope_value" VARCHAR(255),
    "max_votes_per_voter" INTEGER NOT NULL DEFAULT 1,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "positions_election_id_idx" ON "positions"("election_id");
CREATE INDEX "positions_scope_scope_value_idx" ON "positions"("scope", "scope_value");

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "party" VARCHAR(255),
    "description" TEXT,
    "photo_url" VARCHAR(500),
    "ballot_number" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "candidates_position_id_idx" ON "candidates"("position_id");

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "election_enrollments" (
    "id" UUID NOT NULL,
    "election_id" UUID NOT NULL,
    "voter_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "election_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "election_enrollments_election_id_voter_id_key" ON "election_enrollments"("election_id", "voter_id");
CREATE INDEX "election_enrollments_election_id_idx" ON "election_enrollments"("election_id");
CREATE INDEX "election_enrollments_voter_id_idx" ON "election_enrollments"("voter_id");

-- AddForeignKey
ALTER TABLE "election_enrollments" ADD CONSTRAINT "election_enrollments_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "election_enrollments" ADD CONSTRAINT "election_enrollments_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "voters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable votes: add election_id (nullable, for legacy votes)
ALTER TABLE "votes" ADD COLUMN "election_id" UUID;

-- CreateIndex
CREATE INDEX "votes_election_id_idx" ON "votes"("election_id");

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
