-- Backlog 11.8: remove the agent<->distributor network feature (plan 12 section 4) and the
-- orphan columns found by the legacy sweep (13-legacy-sweep.md PR-F).
--
-- DESTRUCTIVE. The two guards below abort the whole migration (it runs in one transaction) if
-- any restock request exists or any partner is still linked to an agent, so nothing is dropped
-- while data would be lost. Rehearse on a backup branch first, then production via .env.deploy.

DO $$ BEGIN
  IF (SELECT count(*) FROM "RestockRequest") > 0 THEN
    RAISE EXCEPTION 'RestockRequest not empty';
  END IF;
END $$;

DO $$ BEGIN
  IF (SELECT count(*) FROM "Partner" WHERE "linkedAgentId" IS NOT NULL) > 0 THEN
    RAISE EXCEPTION 'Partner.linkedAgentId still in use';
  END IF;
END $$;

-- Restock requests: child table first (its FKs and indexes go with the table).
ALTER TABLE "RestockRequestItem" DROP CONSTRAINT IF EXISTS "RestockRequestItem_restockRequestId_fkey";
ALTER TABLE "RestockRequestItem" DROP CONSTRAINT IF EXISTS "RestockRequestItem_variantId_fkey";
ALTER TABLE "RestockRequest" DROP CONSTRAINT IF EXISTS "RestockRequest_sourcePartnerId_fkey";
ALTER TABLE "RestockRequest" DROP CONSTRAINT IF EXISTS "RestockRequest_destinationPartnerId_fkey";
DROP TABLE IF EXISTS "RestockRequestItem";
DROP TABLE IF EXISTS "RestockRequest";
DROP TYPE IF EXISTS "RestockRequestStatus";

-- Ledger rows no longer point at a restock request (plain column, no FK).
DROP INDEX IF EXISTS "InventoryLedger_restockRequestId_idx";
ALTER TABLE "InventoryLedger" DROP COLUMN IF EXISTS "restockRequestId";

-- Partner.linkedAgentId and its self-relation.
ALTER TABLE "Partner" DROP CONSTRAINT IF EXISTS "Partner_linkedAgentId_fkey";
DROP INDEX IF EXISTS "Partner_linkedAgentId_idx";
ALTER TABLE "Partner" DROP COLUMN IF EXISTS "linkedAgentId";

-- PR-F: columns nothing reads or writes any more.
ALTER TABLE "Partner" DROP COLUMN IF EXISTS "alertsSeenAt";
ALTER TABLE "RoutedOrder" DROP COLUMN IF EXISTS "notifiedAt";
ALTER TABLE "RoutedOrder" DROP COLUMN IF EXISTS "notificationError";
