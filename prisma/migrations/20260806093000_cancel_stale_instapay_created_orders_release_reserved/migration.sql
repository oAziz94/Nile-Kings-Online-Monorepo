-- Cancel stale unpaid InstaPay orders and release their reserved stock.
--
-- Scope is intentionally narrow: only CREATED + INSTAPAY_PREPAID orders older
-- than 2026-04-01. These are legacy unpaid holds that have kept stockReserved
-- locked for months.

DO $$
DECLARE
  gamal_partner_id TEXT;
  gamal_matches INTEGER;
  cancellation_note TEXT := 'system_stale_instapay_created_order';
  cancellation_details JSONB := jsonb_build_object(
    'cancellationReason', 'system_stale_instapay_created_order',
    'note', 'Cancelled by system because the unpaid InstaPay order was very old.',
    'cutoff', '2026-04-01T00:00:00.000Z'
  );
BEGIN
  SELECT count(*), min(id)
    INTO gamal_matches, gamal_partner_id
  FROM "Partner"
  WHERE name = 'جمال السيد عبدالعزيز'
    AND phone IN ('01062508999', '+201062508999');

  IF gamal_matches <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Gamal partner row, found %', gamal_matches;
  END IF;

  CREATE TEMP TABLE stale_instapay_orders_to_cancel ON COMMIT DROP AS
  SELECT id
  FROM "Order"
  WHERE status = 'CREATED'
    AND "paymentMethod" = 'INSTAPAY_PREPAID'
    AND "createdAt" < timestamp '2026-04-01 00:00:00'
    AND (
      "cancellationReason" IS NULL
      OR "cancellationReason" <> cancellation_note
    );

  CREATE TEMP TABLE stale_instapay_release_lines ON COMMIT DROP AS
  SELECT
    oi."variantId",
    sum(oi.quantity)::int AS quantity
  FROM "OrderItem" oi
  JOIN stale_instapay_orders_to_cancel stale
    ON stale.id = oi."orderId"
  GROUP BY oi."variantId";

  INSERT INTO "OrderAuditLog" (
    id,
    "orderId",
    event,
    "statusFrom",
    "statusTo",
    details,
    "createdAt"
  )
  SELECT
    'audit_cancel_stale_instapay_20260806_' || md5(stale.id),
    stale.id,
    'cancelled',
    'CREATED',
    'CANCELLED',
    cancellation_details,
    CURRENT_TIMESTAMP
  FROM stale_instapay_orders_to_cancel stale
  ON CONFLICT (id) DO NOTHING;

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
    'ledger_release_stale_instapay_20260806_' || md5(gamal_partner_id || ':' || lines."variantId"),
    gamal_partner_id,
    lines."variantId",
    'ORDER_RELEASE'::"InventoryLedgerReason",
    0,
    -least(coalesce(pi."stockReserved", 0), lines.quantity),
    'Data migration: release reserved stock for stale unpaid InstaPay orders cancelled by system.',
    CURRENT_TIMESTAMP
  FROM stale_instapay_release_lines lines
  LEFT JOIN "PartnerInventory" pi
    ON pi."partnerId" = gamal_partner_id
   AND pi."variantId" = lines."variantId"
  WHERE least(coalesce(pi."stockReserved", 0), lines.quantity) > 0
  ON CONFLICT (id) DO NOTHING;

  UPDATE "Variant" v
  SET "stockReserved" = v."stockReserved" - least(v."stockReserved", lines.quantity)
  FROM stale_instapay_release_lines lines
  WHERE v.id = lines."variantId"
    AND least(v."stockReserved", lines.quantity) > 0;

  UPDATE "PartnerInventory" pi
  SET
    "stockReserved" = pi."stockReserved" - least(pi."stockReserved", lines.quantity),
    "updatedAt" = CURRENT_TIMESTAMP
  FROM stale_instapay_release_lines lines
  WHERE pi."partnerId" = gamal_partner_id
    AND pi."variantId" = lines."variantId"
    AND least(pi."stockReserved", lines.quantity) > 0;

  UPDATE "Order" o
  SET
    status = 'CANCELLED',
    "cancellationReason" = cancellation_note,
    "adminNotes" = concat_ws(
      E'\n',
      nullif(o."adminNotes", ''),
      'Cancelled by system because the unpaid InstaPay order was very old.'
    )
  FROM stale_instapay_orders_to_cancel stale
  WHERE stale.id = o.id
    AND o.status = 'CREATED';
END $$;
