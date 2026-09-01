import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const GAMAL_NAME = "جمال السيد عبدالعزيز";
const RECONCILE_LEDGER_PREFIX = "ledger_gamal_reconcile_20260806_";
const RECONCILE_NOTE =
  "Data migration: reconcile Gamal partner inventory to current legacy Variant stock after post-routing orders.";
const INITIAL_MIGRATION = "20260713090000_partner_inventory_routing";
const RECONCILE_MIGRATION =
  "20260806090000_backfill_routed_order_partners_and_reconcile_gamal_inventory";

function normalize(rows: unknown) {
  return JSON.parse(
    JSON.stringify(rows, (_key, value) => (typeof value === "bigint" ? Number(value) : value))
  );
}

async function raw<T = unknown>(sql: string): Promise<T> {
  return prisma.$queryRawUnsafe(sql) as Promise<T>;
}

async function main() {
  const migrations = await raw(`
    SELECT migration_name, started_at, finished_at
    FROM "_prisma_migrations"
    WHERE migration_name IN ('${INITIAL_MIGRATION}', '${RECONCILE_MIGRATION}')
    ORDER BY started_at ASC
  `);

  const summary = await raw(`
    WITH gamal AS (
      SELECT id FROM "Partner" WHERE name = '${GAMAL_NAME}' LIMIT 1
    ),
    windows AS (
      SELECT
        (SELECT started_at FROM "_prisma_migrations" WHERE migration_name = '${INITIAL_MIGRATION}') AS initial_started_at,
        (SELECT started_at FROM "_prisma_migrations" WHERE migration_name = '${RECONCILE_MIGRATION}') AS reconcile_started_at
    ),
    recon AS (
      SELECT
        il.*,
        v.sku,
        v.name AS variant_name,
        v."createdAt" AS variant_created_at,
        v."updatedAt" AS variant_updated_at,
        p.name AS product_name,
        CASE
          WHEN v."createdAt" >= (SELECT initial_started_at FROM windows)
           AND v."createdAt" < (SELECT reconcile_started_at FROM windows)
          THEN 'variant_created_after_partner_migration_before_reconcile'
          ELSE 'existing_variant_stock_changed_before_reconcile'
        END AS bucket
      FROM "InventoryLedger" il
      JOIN "Variant" v ON v.id = il."variantId"
      JOIN "Product" p ON p.id = v."productId"
      WHERE il."partnerId" = (SELECT id FROM gamal)
        AND il.id LIKE '${RECONCILE_LEDGER_PREFIX}%'
        AND il.notes = '${RECONCILE_NOTE}'
    )
    SELECT
      bucket,
      count(*)::int AS variants,
      coalesce(sum("quantityAvailableDelta"), 0)::int AS available_delta,
      coalesce(sum("quantityReservedDelta"), 0)::int AS reserved_delta,
      count(*) FILTER (WHERE "quantityAvailableDelta" > 0)::int AS variants_legacy_higher,
      coalesce(sum("quantityAvailableDelta") FILTER (WHERE "quantityAvailableDelta" > 0), 0)::int AS units_legacy_higher,
      count(*) FILTER (WHERE "quantityAvailableDelta" < 0)::int AS variants_legacy_lower,
      coalesce(sum("quantityAvailableDelta") FILTER (WHERE "quantityAvailableDelta" < 0), 0)::int AS units_legacy_lower
    FROM recon
    GROUP BY bucket
    ORDER BY bucket ASC
  `);

  const totals = await raw(`
    WITH gamal AS (
      SELECT id FROM "Partner" WHERE name = '${GAMAL_NAME}' LIMIT 1
    )
    SELECT
      count(*)::int AS reconcile_entries,
      coalesce(sum("quantityAvailableDelta"), 0)::int AS available_delta,
      coalesce(sum("quantityReservedDelta"), 0)::int AS reserved_delta,
      min("createdAt") AS first_entry,
      max("createdAt") AS last_entry
    FROM "InventoryLedger"
    WHERE "partnerId" = (SELECT id FROM gamal)
      AND id LIKE '${RECONCILE_LEDGER_PREFIX}%'
      AND notes = '${RECONCILE_NOTE}'
  `);

  const topRows = await raw(`
    WITH gamal AS (
      SELECT id FROM "Partner" WHERE name = '${GAMAL_NAME}' LIMIT 1
    ),
    windows AS (
      SELECT
        (SELECT started_at FROM "_prisma_migrations" WHERE migration_name = '${INITIAL_MIGRATION}') AS initial_started_at,
        (SELECT started_at FROM "_prisma_migrations" WHERE migration_name = '${RECONCILE_MIGRATION}') AS reconcile_started_at
    ),
    recon AS (
      SELECT
        il.id AS ledger_id,
        il."createdAt" AS ledger_created_at,
        il."quantityAvailableDelta" AS available_delta,
        il."quantityReservedDelta" AS reserved_delta,
        v.id AS variant_id,
        v.sku,
        v.name AS variant_name,
        v."colorName" AS color_name,
        v."stockAvailable" AS current_legacy_available,
        v."stockReserved" AS current_legacy_reserved,
        v."createdAt" AS variant_created_at,
        v."updatedAt" AS variant_updated_at,
        p.name AS product_name,
        c.name AS category_name,
        CASE
          WHEN v."createdAt" >= (SELECT initial_started_at FROM windows)
           AND v."createdAt" < (SELECT reconcile_started_at FROM windows)
          THEN 'NEW_VARIANT_CREATED_IN_ADMIN_WINDOW'
          ELSE 'EXISTING_VARIANT_STOCK_CHANGED_IN_ADMIN_WINDOW'
        END AS bucket
      FROM "InventoryLedger" il
      JOIN "Variant" v ON v.id = il."variantId"
      JOIN "Product" p ON p.id = v."productId"
      JOIN "Category" c ON c.id = p."categoryId"
      WHERE il."partnerId" = (SELECT id FROM gamal)
        AND il.id LIKE '${RECONCILE_LEDGER_PREFIX}%'
        AND il.notes = '${RECONCILE_NOTE}'
    )
    SELECT *
    FROM recon
    ORDER BY bucket ASC, abs(available_delta) DESC, sku ASC
    LIMIT 40
  `);

  const productSummary = await raw(`
    WITH gamal AS (
      SELECT id FROM "Partner" WHERE name = '${GAMAL_NAME}' LIMIT 1
    ),
    windows AS (
      SELECT
        (SELECT started_at FROM "_prisma_migrations" WHERE migration_name = '${INITIAL_MIGRATION}') AS initial_started_at,
        (SELECT started_at FROM "_prisma_migrations" WHERE migration_name = '${RECONCILE_MIGRATION}') AS reconcile_started_at
    ),
    recon AS (
      SELECT
        il."quantityAvailableDelta" AS available_delta,
        p.name AS product_name,
        c.name AS category_name,
        CASE
          WHEN v."createdAt" >= (SELECT initial_started_at FROM windows)
           AND v."createdAt" < (SELECT reconcile_started_at FROM windows)
          THEN 'NEW_VARIANT_CREATED_IN_ADMIN_WINDOW'
          ELSE 'EXISTING_VARIANT_STOCK_CHANGED_IN_ADMIN_WINDOW'
        END AS bucket
      FROM "InventoryLedger" il
      JOIN "Variant" v ON v.id = il."variantId"
      JOIN "Product" p ON p.id = v."productId"
      JOIN "Category" c ON c.id = p."categoryId"
      WHERE il."partnerId" = (SELECT id FROM gamal)
        AND il.id LIKE '${RECONCILE_LEDGER_PREFIX}%'
        AND il.notes = '${RECONCILE_NOTE}'
    )
    SELECT
      bucket,
      category_name,
      product_name,
      count(*)::int AS variants,
      coalesce(sum(available_delta), 0)::int AS available_delta
    FROM recon
    GROUP BY bucket, category_name, product_name
    ORDER BY bucket ASC, abs(coalesce(sum(available_delta), 0)) DESC, product_name ASC
    LIMIT 40
  `);

  const recentVariantCreationsBeforeBackfill = await raw(`
    WITH windows AS (
      SELECT
        (SELECT started_at FROM "_prisma_migrations" WHERE migration_name = '${INITIAL_MIGRATION}') AS initial_started_at,
        (SELECT started_at FROM "_prisma_migrations" WHERE migration_name = '${RECONCILE_MIGRATION}') AS reconcile_started_at
    )
    SELECT
      v.id AS variant_id,
      v.sku,
      v.name AS variant_name,
      v."colorName" AS color_name,
      v."stockAvailable" AS legacy_available_at_query_time,
      v."stockReserved" AS legacy_reserved_at_query_time,
      v."createdAt" AS variant_created_at,
      v."updatedAt" AS variant_updated_at,
      p.name AS product_name,
      c.name AS category_name
    FROM "Variant" v
    JOIN "Product" p ON p.id = v."productId"
    JOIN "Category" c ON c.id = p."categoryId"
    WHERE v."createdAt" >= (SELECT initial_started_at FROM windows)
      AND v."createdAt" < (SELECT reconcile_started_at FROM windows)
    ORDER BY v."createdAt" ASC, v.sku ASC
    LIMIT 40
  `);

  console.log(
    JSON.stringify(
      normalize({
        migrations,
        totals,
        summary,
        productSummary,
        topRows,
        recentVariantCreationsBeforeBackfill,
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
