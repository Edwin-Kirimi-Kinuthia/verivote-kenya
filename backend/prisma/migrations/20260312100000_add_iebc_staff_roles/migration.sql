-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('COMMISSIONER', 'NATIONAL_RO', 'COUNTY_RO', 'CONSTITUENCY_RO', 'PRESIDING_OFFICER', 'ICT_ADMIN', 'OBSERVER');

-- CreateEnum
CREATE TYPE "JurisdictionLevel" AS ENUM ('NATIONAL', 'COUNTY', 'CONSTITUENCY', 'WARD', 'POLLING_STATION');

-- CreateEnum
CREATE TYPE "DeclarationStatus" AS ENUM ('DRAFT', 'DECLARED', 'CONTESTED', 'ANNULLED');

-- CreateTable
CREATE TABLE "iebc_staff" (
    "id" UUID NOT NULL,
    "voter_id" UUID NOT NULL,
    "staff_role" "StaffRole" NOT NULL,
    "jurisdiction_level" "JurisdictionLevel" NOT NULL,
    "jurisdiction_value" VARCHAR(255),
    "polling_station_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_staff_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "iebc_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_declarations" (
    "id" UUID NOT NULL,
    "election_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "status" "DeclarationStatus" NOT NULL DEFAULT 'DRAFT',
    "jurisdiction_level" "JurisdictionLevel" NOT NULL,
    "jurisdiction_value" VARCHAR(255),
    "tally_snapshot" TEXT,
    "declared_at" TIMESTAMP(3),
    "contested_at" TIMESTAMP(3),
    "contest_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "iebc_staff_voter_id_key" ON "iebc_staff"("voter_id");
CREATE INDEX "iebc_staff_staff_role_idx" ON "iebc_staff"("staff_role");
CREATE INDEX "iebc_staff_jurisdiction_level_jurisdiction_value_idx" ON "iebc_staff"("jurisdiction_level", "jurisdiction_value");

-- CreateIndex
CREATE UNIQUE INDEX "result_declarations_election_id_position_id_staff_id_key" ON "result_declarations"("election_id", "position_id", "staff_id");
CREATE INDEX "result_declarations_election_id_idx" ON "result_declarations"("election_id");
CREATE INDEX "result_declarations_position_id_idx" ON "result_declarations"("position_id");
CREATE INDEX "result_declarations_staff_id_idx" ON "result_declarations"("staff_id");
CREATE INDEX "result_declarations_status_idx" ON "result_declarations"("status");

-- AddForeignKey
ALTER TABLE "iebc_staff" ADD CONSTRAINT "iebc_staff_voter_id_fkey" FOREIGN KEY ("voter_id") REFERENCES "voters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "iebc_staff" ADD CONSTRAINT "iebc_staff_polling_station_id_fkey" FOREIGN KEY ("polling_station_id") REFERENCES "polling_stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "iebc_staff" ADD CONSTRAINT "iebc_staff_created_by_staff_id_fkey" FOREIGN KEY ("created_by_staff_id") REFERENCES "iebc_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "result_declarations" ADD CONSTRAINT "result_declarations_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "result_declarations" ADD CONSTRAINT "result_declarations_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "result_declarations" ADD CONSTRAINT "result_declarations_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "iebc_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
