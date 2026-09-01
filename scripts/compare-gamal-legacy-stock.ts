import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const GAMAL_NAME = "جمال السيد عبدالعزيز";
const SINCE = "2026-08-06 09:00:00";

function normalize(rows: unknown) {
  return JSON.parse(
    JSON.stringify(rows, (_key, value) => (typeof value === "bigint" ? Number(value) : value))
  );
}

async function raw<T = unknown>(sql: string): Promise<T> {
  return prisma.$queryRawUnsafe(sql) as Promise<T>;
}

async function main() {
  const summary = await raw(`
    WITH gamal AS (
      SELECT id FROM "Partner" WHERE name = '${GAMAL_NAME}' LIMIT 1
    ),
    legacy AS (
      SELECT
        count(*)::int AS rows,
        coalesce(sum("stockAvailable"), 0)::int AS available,
        coalesce(sum("stockReserved"), 0)::int AS reserved
      FROM "Variant"
    ),
    gamal_inv AS (
      SELECT
        count(*)::int AS rows,
        coalesce(sum("stockAvailable"), 0)::int AS available,
        coalesce(sum("stockReserved"), 0)::int AS reserved
      FROM "PartnerInventory"
      WHERE "partnerId" = (SELECT id FROM gamal)
    ),
    mismatch AS (
      SELECT
        v.id,
        v.sku,
        v."stockAvailable" AS legacy_available,
        coalesce(pi."stockAvailable", 0) AS gamal_available,
        v."stockAvailable" - coalesce(pi."stockAvailable", 0) AS available_delta,
        v."stockReserved" AS legacy_reserved,
        coalesce(pi."stockReserved", 0) AS gamal_reserved,
        v."stockReserved" - coalesce(pi."stockReserved", 0) AS reserved_delta
      FROM "Variant" v
      LEFT JOIN "PartnerInventory" pi
        ON pi."variantId" = v.id
       AND pi."partnerId" = (SELECT id FROM gamal)
      WHERE v."stockAvailable" <> coalesce(pi."stockAvailable", 0)
         OR v."stockReserved" <> coalesce(pi."stockReserved", 0)
    ),
    ledger_since AS (
      SELECT
        coalesce(sum("quantityAvailableDelta"), 0)::int AS available_delta,
        coalesce(sum("quantityReservedDelta"), 0)::int AS reserved_delta,
        count(*)::int AS entries
      FROM "InventoryLedger"
      WHERE "partnerId" = (SELECT id FROM gamal)
        AND "createdAt" >= timestamp '${SINCE}'
    )
    SELECT
      (SELECT row_to_json(legacy) FROM legacy) AS legacy,
      (SELECT row_to_json(gamal_inv) FROM gamal_inv) AS gamal_inventory,
      (SELECT count(*)::int FROM mismatch) AS mismatch_count,
      (SELECT coalesce(sum(available_delta), 0)::int FROM mismatch) AS net_available_delta_legacy_minus_gamal,
      (SELECT coalesce(sum(reserved_delta), 0)::int FROM mismatch) AS net_reserved_delta_legacy_minus_gamal,
      (SELECT row_to_json(ledger_since) FROM ledger_since) AS ledger_since_aug6
  `);

  const ordersSince = await raw(`
    WITH gamal AS (
      SELECT id FROM "Partner" WHERE name = '${GAMAL_NAME}' LIMIT 1
    )
    SELECT
      o.status,
      count(DISTINCT o.id)::int AS orders,
      coalesce(sum(oi.quantity), 0)::int AS units
    FROM "Order" o
    JOIN "OrderItem" oi ON oi."orderId" = o.id
    WHERE o."assignedPartnerId" = (SELECT id FROM gamal)
      AND o."createdAt" >= timestamp '${SINCE}'
    GROUP BY o.status
    ORDER BY o.status ASC
  `);

  const mismatchRows = await raw(`
    WITH gamal AS (
      SELECT id FROM "Partner" WHERE name = '${GAMAL_NAME}' LIMIT 1
    ),
    mismatch AS (
      SELECT
        v.id,
        v.sku,
        v."stockAvailable" AS legacy_available,
        coalesce(pi."stockAvailable", 0) AS gamal_available,
        v."stockAvailable" - coalesce(pi."stockAvailable", 0) AS available_delta,
        v."stockReserved" AS legacy_reserved,
        coalesce(pi."stockReserved", 0) AS gamal_reserved,
        v."stockReserved" - coalesce(pi."stockReserved", 0) AS reserved_delta
      FROM "Variant" v
      LEFT JOIN "PartnerInventory" pi
        ON pi."variantId" = v.id
       AND pi."partnerId" = (SELECT id FROM gamal)
      WHERE v."stockAvailable" <> coalesce(pi."stockAvailable", 0)
         OR v."stockReserved" <> coalesce(pi."stockReserved", 0)
    ),
    ledger AS (
      SELECT
        "variantId",
        coalesce(sum("quantityAvailableDelta"), 0)::int AS available_delta,
        coalesce(sum("quantityReservedDelta"), 0)::int AS reserved_delta,
        count(*)::int AS entries
      FROM "InventoryLedger"
      WHERE "partnerId" = (SELECT id FROM gamal)
        AND "createdAt" >= timestamp '${SINCE}'
      GROUP BY "variantId"
    ),
    active_order_lines AS (
      SELECT
        oi."variantId",
        coalesce(sum(oi.quantity), 0)::int AS units,
        count(DISTINCT o.id)::int AS orders
      FROM "Order" o
      JOIN "OrderItem" oi ON oi."orderId" = o.id
      WHERE o."assignedPartnerId" = (SELECT id FROM gamal)
        AND o."createdAt" >= timestamp '${SINCE}'
        AND o.status IN ('CONFIRMED', 'PROCESSING', 'READY_TO_SHIP', 'SHIPPED', 'DELIVERED')
      GROUP BY oi."variantId"
    )
    SELECT
      m.sku,
      m.legacy_available,
      m.gamal_available,
      m.available_delta,
      m.legacy_reserved,
      m.gamal_reserved,
      m.reserved_delta,
      coalesce(l.available_delta, 0) AS ledger_available_delta_since_aug6,
      coalesce(l.reserved_delta, 0) AS ledger_reserved_delta_since_aug6,
      coalesce(l.entries, 0) AS ledger_entries_since_aug6,
      coalesce(aol.units, 0) AS active_order_units_since_aug6,
      coalesce(aol.orders, 0) AS active_orders_since_aug6
    FROM mismatch m
    LEFT JOIN ledger l ON l."variantId" = m.id
    LEFT JOIN active_order_lines aol ON aol."variantId" = m.id
    ORDER BY abs(m.available_delta) DESC, m.sku ASC
  `);

  console.log(JSON.stringify(normalize({ summary, ordersSince, mismatchRows }), null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
