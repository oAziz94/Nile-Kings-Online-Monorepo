-- Backlog 9.9 ("Retire the legacy variant stock columns"): stock exists only in
-- PartnerInventory from now on. Drop the two legacy Variant columns and their index.
--
-- Production note (see docs/redesign/05-partner-portal-v2.md's deploy section): run this
-- migration only after the reconcile confirms production's legacy Variant.stockAvailable/
-- stockReserved sums are zero, or any nonzero remainder is accounted for in partner receipts
-- (i.e. already reflected in PartnerInventory) — the same reconcile discipline
-- 20260806090000_backfill_routed_order_partners_and_reconcile_gamal_inventory established for
-- the Gamal partner. On the redesign Neon branch this data is disposable and the migration
-- runs immediately via `db:push:redesign`.

DROP INDEX IF EXISTS "Variant_stockAvailable_idx";

ALTER TABLE "Variant" DROP COLUMN "stockAvailable";
ALTER TABLE "Variant" DROP COLUMN "stockReserved";
