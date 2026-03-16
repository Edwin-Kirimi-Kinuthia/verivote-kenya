-- Add scope_value to candidates table.
-- Enables "template positions" where one position (e.g. Governor, scope=COUNTY)
-- covers all 47 counties. Each candidate carries their own scope_value (county name)
-- so the ballot service can filter to only show the voter's local candidates.
-- Fully backward-compatible: candidates without scope_value behave as before.

ALTER TABLE "candidates" ADD COLUMN "scope_value" VARCHAR(255);

CREATE INDEX "candidates_position_id_scope_value_idx"
  ON "candidates"("position_id", "scope_value");
