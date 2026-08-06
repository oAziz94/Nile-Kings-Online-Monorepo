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
  const reservedVariants = await raw(`
    SELECT
      v.id AS "variantId",
      v.sku,
      p.name AS "productName",
      v.name AS "variantName",
      v."colorName",
      v."stockAvailable",
      v."stockReserved",
      coalesce(open_created.qty, 0)::int AS "createdOrderQty",
      coalesce(active_precommit.qty, 0)::int AS "activePrecommitQty",
      coalesce(cancelled.qty, 0)::int AS "cancelledQty"
    FROM "Variant" v
    JOIN "Product" p ON p.id = v."productId"
    LEFT JOIN (
      SELECT oi."variantId", sum(oi.quantity)::int AS qty
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE o.status = 'CREATED'
      GROUP BY oi."variantId"
    ) open_created ON open_created."variantId" = v.id
    LEFT JOIN (
      SELECT oi."variantId", sum(oi.quantity)::int AS qty
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE o.status IN ('CREATED', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP')
      GROUP BY oi."variantId"
    ) active_precommit ON active_precommit."variantId" = v.id
    LEFT JOIN (
      SELECT oi."variantId", sum(oi.quantity)::int AS qty
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE o.status = 'CANCELLED'
      GROUP BY oi."variantId"
    ) cancelled ON cancelled."variantId" = v.id
    WHERE v."stockReserved" <> 0
    ORDER BY v.sku ASC
  `);

  const reservedOrders = await raw(`
    SELECT
      o.id,
      o.status,
      o."createdAt",
      o."paymentMethod",
      o."cancellationReason",
      partner.name AS partner,
      routed_partner.name AS "routedPartner",
      oi.sku,
      oi.quantity
    FROM "OrderItem" oi
    JOIN "Order" o ON o.id = oi."orderId"
    JOIN "Variant" v ON v.id = oi."variantId"
    LEFT JOIN "Partner" partner ON partner.id = o."assignedPartnerId"
    LEFT JOIN "RoutedOrder" ro ON ro."orderId" = o.id
    LEFT JOIN "Partner" routed_partner ON routed_partner.id = ro."partnerId"
    WHERE v."stockReserved" <> 0
      AND o.status IN ('CREATED', 'CANCELLED', 'CONFIRMED', 'PROCESSING', 'READY_TO_SHIP')
    ORDER BY o."createdAt" ASC, oi.sku ASC
  `);

  const totals = await raw(`
    WITH reserved_variants AS (
      SELECT id, "stockReserved"
      FROM "Variant"
      WHERE "stockReserved" <> 0
    ),
    created_orders AS (
      SELECT oi."variantId", sum(oi.quantity)::int AS qty
      FROM "OrderItem" oi
      JOIN "Order" o ON o.id = oi."orderId"
      WHERE o.status = 'CREATED'
      GROUP BY oi."variantId"
    )
    SELECT
      count(*)::int AS "reservedVariantRows",
      coalesce(sum(rv."stockReserved"), 0)::int AS "totalReserved",
      coalesce(sum(co.qty), 0)::int AS "createdOrderQtyOnReservedVariants",
      coalesce(sum(rv."stockReserved" - coalesce(co.qty, 0)), 0)::int AS "unexplainedByCreatedOrders"
    FROM reserved_variants rv
    LEFT JOIN created_orders co ON co."variantId" = rv.id
  `);

  console.log(
    JSON.stringify(
      normalizeRows({
        totals,
        reservedVariants,
        reservedOrders,
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
