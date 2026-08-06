-- Backfill order partner columns from existing routed orders, then reconcile
-- Gamal's partner inventory to the current legacy Variant stock counters.
--
-- Mohamed Omran inventory is intentionally not backfilled here. His opening
-- inventory will be entered manually through the partner portal.

DO $$
DECLARE
  gamal_partner_id TEXT;
  gamal_matches INTEGER;
BEGIN
  SELECT count(*), min(id)
    INTO gamal_matches, gamal_partner_id
  FROM "Partner"
  WHERE name = 'جمال السيد عبدالعزيز'
    AND phone IN ('01062508999', '+201062508999');

  IF gamal_matches <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Gamal partner row, found %', gamal_matches;
  END IF;

  -- Existing rerouting data is the source of truth for historical partner
  -- assignment. This fills the new Order fields without changing RoutedOrder.
  UPDATE "Order" o
  SET
    "assignedPartnerId" = ro."partnerId",
    "shippingOriginGovernorate" = p."governorate"
  FROM "RoutedOrder" ro
  JOIN "Partner" p ON p.id = ro."partnerId"
  WHERE ro."orderId" = o.id
    AND ro."partnerId" IS NOT NULL
    AND (
      o."assignedPartnerId" IS DISTINCT FROM ro."partnerId"
      OR o."shippingOriginGovernorate" IS DISTINCT FROM p."governorate"
    );

  -- Record one ledger entry per changed Gamal variant before applying the
  -- correction. The delta is from old PartnerInventory values to current
  -- Variant values.
  INSERT INTO "InventoryLedger" (
    id,
    "partnerId",
    "variantId",
    reason,
    "quantityAvailableDelta",
    "quantityReservedDelta",
    notes,
    "createdAt"
  )
  SELECT
    'ledger_gamal_reconcile_20260806_' || md5(gamal_partner_id || ':' || v.id),
    gamal_partner_id,
    v.id,
    'MANUAL_ADJUSTMENT'::"InventoryLedgerReason",
    v."stockAvailable" - coalesce(pi."stockAvailable", 0),
    v."stockReserved" - coalesce(pi."stockReserved", 0),
    'Data migration: reconcile Gamal partner inventory to current legacy Variant stock after post-routing orders.',
    CURRENT_TIMESTAMP
  FROM "Variant" v
  LEFT JOIN "PartnerInventory" pi
    ON pi."partnerId" = gamal_partner_id
   AND pi."variantId" = v.id
  WHERE (
    coalesce(pi."stockAvailable", 0) IS DISTINCT FROM v."stockAvailable"
    OR coalesce(pi."stockReserved", 0) IS DISTINCT FROM v."stockReserved"
  )
  ON CONFLICT (id) DO NOTHING;

  -- Add missing Gamal inventory rows only when the legacy Variant row currently
  -- has stock or reservations. Missing zero rows remain equivalent to zero.
  INSERT INTO "PartnerInventory" (
    id,
    "partnerId",
    "variantId",
    "stockAvailable",
    "stockReserved",
    "createdAt",
    "updatedAt"
  )
  SELECT
    'pi_gamal_reconcile_' || md5(gamal_partner_id || ':' || v.id),
    gamal_partner_id,
    v.id,
    v."stockAvailable",
    v."stockReserved",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  FROM "Variant" v
  LEFT JOIN "PartnerInventory" pi
    ON pi."partnerId" = gamal_partner_id
   AND pi."variantId" = v.id
  WHERE pi.id IS NULL
    AND (v."stockAvailable" <> 0 OR v."stockReserved" <> 0);

  -- Apply the reconciliation to all existing Gamal rows, including rows that
  -- must become zero because the legacy stock has since sold out.
  UPDATE "PartnerInventory" pi
  SET
    "stockAvailable" = v."stockAvailable",
    "stockReserved" = v."stockReserved",
    "updatedAt" = CURRENT_TIMESTAMP
  FROM "Variant" v
  WHERE pi."partnerId" = gamal_partner_id
    AND pi."variantId" = v.id
    AND (
      pi."stockAvailable" IS DISTINCT FROM v."stockAvailable"
      OR pi."stockReserved" IS DISTINCT FROM v."stockReserved"
    );
END $$;
