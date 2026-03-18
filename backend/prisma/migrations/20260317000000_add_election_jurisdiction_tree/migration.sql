-- CreateTable: election_jurisdictions (self-referential tree)
CREATE TABLE "election_jurisdictions" (
    "id"          UUID         NOT NULL,
    "election_id" UUID         NOT NULL,
    "parent_id"   UUID,
    "name"        VARCHAR(255) NOT NULL,
    "depth"       INTEGER      NOT NULL DEFAULT 0,
    "order_index" INTEGER      NOT NULL DEFAULT 0,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "election_jurisdictions_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "election_jurisdictions_election_id_idx" ON "election_jurisdictions"("election_id");
CREATE INDEX "election_jurisdictions_parent_id_idx"   ON "election_jurisdictions"("parent_id");
CREATE INDEX "election_jurisdictions_election_name_idx" ON "election_jurisdictions"("election_id", "name");

-- Foreign keys
ALTER TABLE "election_jurisdictions"
    ADD CONSTRAINT "election_jurisdictions_election_id_fkey"
    FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "election_jurisdictions"
    ADD CONSTRAINT "election_jurisdictions_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "election_jurisdictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable positions: add optional jurisdiction_id
ALTER TABLE "positions" ADD COLUMN "jurisdiction_id" UUID;

CREATE INDEX "positions_jurisdiction_id_idx" ON "positions"("jurisdiction_id");

ALTER TABLE "positions"
    ADD CONSTRAINT "positions_jurisdiction_id_fkey"
    FOREIGN KEY ("jurisdiction_id") REFERENCES "election_jurisdictions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
