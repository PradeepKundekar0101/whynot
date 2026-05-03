-- Multi-format break refactor:
--   - Replace breakFormat with assignmentMode (4 values instead of 2)
--   - Introduce spotType (semantic: team/character/pack/hit/slot)
--   - Introduce spotPool (pool the assignment engine draws from)
--   - Add consolationPrize (per-break bonus item)
--
-- All existing data is sports-team based, so we backfill spotType='team'
-- and map breakFormat='random' (which already meant "Fisher-Yates at break
-- creation" after the previous auto-reveal refactor) → 'pre_assigned'.

ALTER TABLE "Listing"
  ADD COLUMN "spotType" TEXT NOT NULL DEFAULT 'slot',
  ADD COLUMN "assignmentMode" TEXT NOT NULL DEFAULT 'pick_your',
  ADD COLUMN "spotPool" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN "consolationPrize" TEXT;

-- Map breakFormat → assignmentMode for in-flight breaks.
UPDATE "Listing"
SET "assignmentMode" = CASE
  WHEN "breakFormat" = 'pick_your' THEN 'pick_your'
  WHEN "breakFormat" = 'random'    THEN 'pre_assigned'
  ELSE 'pick_your'
END;

-- All existing breaks were team breaks (NFL/NBA/MLB/NHL or custom-team).
UPDATE "Listing" SET "spotType" = 'team';

-- Backfill spotPool from each break's existing per-spot teams. For
-- pre_assigned breaks this captures the shuffled pool that's already in
-- play; for pick_your breaks it captures the team-name list. We deduplicate
-- + preserve spotNumber order so seller-facing UIs render naturally.
UPDATE "Listing" l SET "spotPool" = COALESCE(
  ARRAY(
    SELECT DISTINCT ON (s."preAssignedTeam") s."preAssignedTeam"
    FROM "Spot" s
    WHERE s."listingId" = l.id
      AND s."preAssignedTeam" IS NOT NULL
    ORDER BY s."preAssignedTeam", s."spotNumber" ASC
  ),
  '{}'
);

-- breakFormat is fully replaced by assignmentMode.
ALTER TABLE "Listing" DROP COLUMN "breakFormat";
