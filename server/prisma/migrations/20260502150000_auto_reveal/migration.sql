-- Drop columns that are no longer needed for the auto-reveal flow.
-- These were part of the old "manual reveal mode" pipeline.
ALTER TABLE "Listing" DROP COLUMN IF EXISTS "currentRevealingSpotId";
ALTER TABLE "Listing" DROP COLUMN IF EXISTS "randomizationCompletedAt";
ALTER TABLE "Listing" DROP COLUMN IF EXISTS "revealStartedAt";

-- Add the new auto-reveal columns on Spot.
-- preAssignedTeam stores the Fisher-Yates shuffled team assigned at break creation
-- (for random format) or the spot name itself (for pick-your).
-- isRevealedToBuyers gates whether buyers can see the team via the API.
ALTER TABLE "Spot" ADD COLUMN "preAssignedTeam" TEXT;
ALTER TABLE "Spot" ADD COLUMN "isRevealedToBuyers" BOOLEAN NOT NULL DEFAULT false;

-- Backfill preAssignedTeam from the existing assignedName column where present
-- so any in-flight breaks keep their team data.
UPDATE "Spot" SET "preAssignedTeam" = "assignedName" WHERE "assignedName" IS NOT NULL;

-- Mark already-revealed spots from the old manual flow as revealed under the new gate.
UPDATE "Spot" SET "isRevealedToBuyers" = true WHERE "revealStatus" = 'revealed';

-- Drop columns from the deprecated reveal pipeline.
ALTER TABLE "Spot" DROP COLUMN IF EXISTS "assignedName";
ALTER TABLE "Spot" DROP COLUMN IF EXISTS "spinPlayedAt";
ALTER TABLE "Spot" DROP COLUMN IF EXISTS "revealStatus";
ALTER TABLE "Spot" DROP COLUMN IF EXISTS "revealOrder";
ALTER TABLE "Spot" DROP COLUMN IF EXISTS "isPinned";

-- Replace the old listingId+revealStatus index with one keyed on isRevealedToBuyers.
DROP INDEX IF EXISTS "Spot_listingId_revealStatus_idx";
CREATE INDEX "Spot_listingId_isRevealedToBuyers_idx"
  ON "Spot" ("listingId", "isRevealedToBuyers");

-- Normalize any in-flight Listings that were stuck in the deprecated states.
UPDATE "Listing" SET "status" = 'completed' WHERE "status" IN ('randomizing', 'revealing');
