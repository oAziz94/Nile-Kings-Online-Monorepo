import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function normalizeRows(rows: unknown) {
  return JSON.parse(
    JSON.stringify(rows, (_key, value) => (typeof value === "bigint" ? Number(value) : value))
  );
}

async function raw<T = unknown>(sql: string): Promise<T> {
  return prisma.$queryRawUnsafe(sql) as Promise<T>;
}

async function main() {
  const migration = await raw(`
    SELECT migration_name, started_at, finished_at, applied_steps_count, rolled_back_at
    FROM "_prisma_migrations"
    WHERE migration_name = '20260713090000_partner_inventory_routing'
  `);

  const partners = await raw(`
    SELECT id, name, phone, governorate, "partnerType", "isActive", "userId", "createdAt"
    FROM "Partner"
    ORDER BY "createdAt" ASC
  `);

  const inventoryTotals = await raw(`
    SELECT
      p.name,
      p.phone,
      p.governorate,
      pi."partnerId",
      count(*)::int AS rows,
      coalesce(sum(pi."stockAvailable"), 0)::int AS available,
      coalesce(sum(pi."stockReserved"), 0)::int AS reserved
    FROM "PartnerInventory" pi
    JOIN "Partner" p ON p.id = pi."partnerId"
    GROUP BY p.name, p.phone, p.governorate, pi."partnerId"
    ORDER BY available DESC, p.name ASC
  `);

  const ledgerTotals = await raw(`
    SELECT
      p.name,
      il.reason,
      count(*)::int AS entries,
      coalesce(sum(il."quantityAvailableDelta"), 0)::int AS available_delta,
      coalesce(sum(il."quantityReservedDelta"), 0)::int AS reserved_delta
    FROM "InventoryLedger" il
    JOIN "Partner" p ON p.id = il."partnerId"
    GROUP BY p.name, il.reason
    ORDER BY p.name ASC, il.reason ASC
  `);

  const ledgerWindow = await raw(`
    SELECT
      min("createdAt") AS first_ledger,
      max("createdAt") AS last_ledger,
      count(*)::int AS entries
    FROM "InventoryLedger"
  `);

  const ordersByPartner = await raw(`
    SELECT
      coalesce(p.name, 'UNASSIGNED') AS partner,
      o.status,
      count(*)::int AS orders,
      min(o."createdAt") AS first_created,
      max(o."createdAt") AS last_created
    FROM "Order" o
    LEFT JOIN "Partner" p ON p.id = o."assignedPartnerId"
    GROUP BY coalesce(p.name, 'UNASSIGNED'), o.status
    ORDER BY partner ASC, o.status ASC
  `);

  const postMigrationRoutedByPartner = await raw(`
    SELECT
      coalesce(rp.name, 'UNROUTED') AS routed_partner,
      ro.status AS routed_status,
      o.status AS order_status,
      count(*)::int AS orders,
      coalesce(sum(order_qty.qty), 0)::int AS units,
      min(o."createdAt") AS first_created,
      max(o."createdAt") AS last_created
    FROM "RoutedOrder" ro
    JOIN "Order" o ON o.id = ro."orderId"
    LEFT JOIN "Partner" rp ON rp.id = ro."partnerId"
    LEFT JOIN (
      SELECT "orderId", sum(quantity)::int AS qty
      FROM "OrderItem"
      GROUP BY "orderId"
    ) order_qty ON order_qty."orderId" = o.id
    WHERE o."createdAt" >= timestamp '2026-07-13 09:16:22.180'
    GROUP BY coalesce(rp.name, 'UNROUTED'), ro.status, o.status
    ORDER BY routed_partner ASC, order_status ASC
  `);

  const postMigrationTotals = await raw(`
    SELECT
      count(*)::int AS total_orders,
      count(*) FILTER (WHERE o."assignedPartnerId" IS NOT NULL)::int AS orders_with_assigned_partner,
      count(*) FILTER (WHERE ro."partnerId" IS NOT NULL)::int AS routed_orders_with_partner,
      count(*) FILTER (WHERE ro."partnerId" IS NOT NULL AND o."assignedPartnerId" IS NULL)::int AS routed_partner_missing_on_order
    FROM "Order" o
    LEFT JOIN "RoutedOrder" ro ON ro."orderId" = o.id
    WHERE o."createdAt" >= timestamp '2026-07-13 09:16:22.180'
  `);

  const legacyVsGamalInventory = await raw(`
    SELECT
      (SELECT count(*)::int FROM "Variant") AS variant_rows,
      (SELECT coalesce(sum("stockAvailable"), 0)::int FROM "Variant") AS variant_available,
      (SELECT coalesce(sum("stockReserved"), 0)::int FROM "Variant") AS variant_reserved,
      (SELECT count(*)::int FROM "PartnerInventory" pi JOIN "Partner" p ON p.id = pi."partnerId" WHERE p.name = 'جمال السيد عبدالعزيز') AS gamal_inventory_rows,
      (SELECT coalesce(sum(pi."stockAvailable"), 0)::int FROM "PartnerInventory" pi JOIN "Partner" p ON p.id = pi."partnerId" WHERE p.name = 'جمال السيد عبدالعزيز') AS gamal_available,
      (SELECT coalesce(sum(pi."stockReserved"), 0)::int FROM "PartnerInventory" pi JOIN "Partner" p ON p.id = pi."partnerId" WHERE p.name = 'جمال السيد عبدالعزيز') AS gamal_reserved
  `);

  const routedPartnersWithoutInventory = await raw(`
    SELECT
      p.name,
      p.id,
      count(DISTINCT ro.id)::int AS routed_orders,
      count(DISTINCT pi.id)::int AS inventory_rows
    FROM "RoutedOrder" ro
    JOIN "Partner" p ON p.id = ro."partnerId"
    LEFT JOIN "PartnerInventory" pi ON pi."partnerId" = p.id
    GROUP BY p.name, p.id
    HAVING count(DISTINCT pi.id) = 0
    ORDER BY routed_orders DESC
  `);

  const recentOrders = await raw(`
    SELECT
      o.id,
      o.status,
      o."createdAt",
      p.name AS partner,
      p.phone,
      o."shippingOriginGovernorate",
      ro.status AS routed_status,
      rp.name AS routed_partner,
      coalesce(sum(oi.quantity), 0)::int AS qty
    FROM "Order" o
    LEFT JOIN "Partner" p ON p.id = o."assignedPartnerId"
    LEFT JOIN "RoutedOrder" ro ON ro."orderId" = o.id
    LEFT JOIN "Partner" rp ON rp.id = ro."partnerId"
    LEFT JOIN "OrderItem" oi ON oi."orderId" = o.id
    GROUP BY o.id, p.name, p.phone, ro.status, rp.name
    ORDER BY o."createdAt" DESC
    LIMIT 25
  `);

  const mismatchedRoutedOrders = await raw(`
    SELECT
      o.id,
      o.status,
      o."createdAt",
      op.name AS order_partner,
      rp.name AS routed_partner,
      ro.status AS routed_status
    FROM "Order" o
    JOIN "RoutedOrder" ro ON ro."orderId" = o.id
    LEFT JOIN "Partner" op ON op.id = o."assignedPartnerId"
    LEFT JOIN "Partner" rp ON rp.id = ro."partnerId"
    WHERE coalesce(o."assignedPartnerId", '') <> coalesce(ro."partnerId", '')
    ORDER BY o."createdAt" DESC
    LIMIT 50
  `);

  const assignedOrdersWithoutLedger = await raw(`
    SELECT o.id, o.status, o."createdAt", p.name AS partner
    FROM "Order" o
    JOIN "Partner" p ON p.id = o."assignedPartnerId"
    WHERE NOT EXISTS (
      SELECT 1
      FROM "InventoryLedger" il
      WHERE il."orderId" = o.id
    )
    ORDER BY o."createdAt" DESC
  `);

  const reservedMismatch = await raw(`
    WITH open_reserved AS (
      SELECT
        o."assignedPartnerId" AS partner_id,
        oi."variantId" AS variant_id,
        sum(oi.quantity)::int AS qty
      FROM "Order" o
      JOIN "OrderItem" oi ON oi."orderId" = o.id
      WHERE o.status = 'CREATED'
        AND o."assignedPartnerId" IS NOT NULL
      GROUP BY o."assignedPartnerId", oi."variantId"
    )
    SELECT
      p.name,
      v.sku,
      coalesce(pi."stockReserved", 0)::int AS inventory_reserved,
      coalesce(orv.qty, 0)::int AS created_order_qty
    FROM open_reserved orv
    FULL JOIN "PartnerInventory" pi
      ON pi."partnerId" = orv.partner_id
     AND pi."variantId" = orv.variant_id
    JOIN "Partner" p ON p.id = coalesce(orv.partner_id, pi."partnerId")
    JOIN "Variant" v ON v.id = coalesce(orv.variant_id, pi."variantId")
    WHERE coalesce(pi."stockReserved", 0) <> coalesce(orv.qty, 0)
    ORDER BY p.name ASC, v.sku ASC
    LIMIT 100
  `);

  console.log(
    JSON.stringify(
      normalizeRows({
        migration,
        partners,
        inventoryTotals,
        ledgerTotals,
        ledgerWindow,
        ordersByPartner,
        postMigrationTotals,
        postMigrationRoutedByPartner,
        legacyVsGamalInventory,
        routedPartnersWithoutInventory,
        recentOrders,
        mismatchedRoutedOrders,
        assignedOrdersWithoutLedger,
        reservedMismatch,
      }),
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
