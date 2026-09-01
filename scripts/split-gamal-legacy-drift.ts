import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GAMAL_NAME = "جمال السيد عبدالعزيز";
const INITIAL_MIGRATION = "20260713090000_partner_inventory_routing";
const RECONCILE_MIGRATION =
  "20260806090000_backfill_routed_order_partners_and_reconcile_gamal_inventory";
const RECONCILE_LEDGER_PREFIX = "ledger_gamal_reconcile_20260806_";
const RECONCILE_NOTE =
  "Data migration: reconcile Gamal partner inventory to current legacy Variant stock after post-routing orders.";

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

  const currentDrift = await raw(`
    WITH gamal AS (
      SELECT id FROM "Partner" WHERE name = '${GAMAL_NAME}' LIMIT 1
    ),
    mismatch AS (
      SELECT
        v.id,
        v.sku,
        v."stockAvailable" AS legacy_available,
        coalesce(pi."stockAvailable", 0) AS partner_available,
        v."stockAvailable" - coalesce(pi."stockAvailable", 0) AS available_legacy_minus_partner,
        v."stockReserved" AS legacy_reserved,
        coalesce(pi."stockReserved", 0) AS partner_reserved,
        v."stockReserved" - coalesce(pi."stockReserved", 0) AS reserved_legacy_minus_partner
      FROM "Variant" v
      LEFT JOIN "PartnerInventory" pi
        ON pi."variantId" = v.id
       AND pi."partnerId" = (SELECT id FROM gamal)
      WHERE v."stockAvailable" <> coalesce(pi."stockAvailable", 0)
         OR v."stockReserved" <> coalesce(pi."stockReserved", 0)
    )
    SELECT
      count(*)::int AS variants,
      coalesce(sum(available_legacy_minus_partner), 0)::int AS available_legacy_minus_partner,
      coalesce(sum(reserved_legacy_minus_partner), 0)::int AS reserved_legacy_minus_partner
    FROM mismatch
  `);

  const validLedgerByReason = await raw(`
    WITH gamal AS (
      SELECT id FROM "Partner" WHERE name = '${GAMAL_NAME}' LIMIT 1
    ),
    windows AS (
      SELECT started_at AS reconcile_started_at
      FROM "_prisma_migrations"
      WHERE migration_name = '${RECONCILE_MIGRATION}'
    )
    SELECT
      reason,
      count(*)::int AS entries,
      coalesce(sum("quantityAvailableDelta"), 0)::int AS partner_available_delta,
      (coalesce(sum("quantityAvailableDelta"), 0) * -1)::int AS expected_available_legacy_minus_partner,
      coalesce(sum("quantityReservedDelta"), 0)::int AS partner_reserved_delta,
      (coalesce(sum("quantityReservedDelta"), 0) * -1)::int AS expected_reserved_legacy_minus_partner
    FROM "InventoryLedger"
    WHERE "partnerId" = (SELECT id FROM gamal)
      AND "createdAt" > (SELECT reconcile_started_at FROM windows)
      AND NOT (id LIKE '${RECONCILE_LEDGER_PREFIX}%' AND notes = '${RECONCILE_NOTE}')
    GROUP BY reason
    ORDER BY reason ASC
  `);

  const validLedgerTotals = await raw(`
    WITH gamal AS (
      SELECT id FROM "Partner" WHERE name = '${GAMAL_NAME}' LIMIT 1
    ),
    windows AS (
      SELECT started_at AS reconcile_started_at
      FROM "_prisma_migrations"
      WHERE migration_name = '${RECONCILE_MIGRATION}'
    )
    SELECT
      count(*)::int AS entries,
      coalesce(sum("quantityAvailableDelta"), 0)::int AS partner_available_delta,
      (coalesce(sum("quantityAvailableDelta"), 0) * -1)::int AS expected_available_legacy_minus_partner,
      coalesce(sum("quantityReservedDelta"), 0)::int AS partner_reserved_delta,
      (coalesce(sum("quantityReservedDelta"), 0) * -1)::int AS expected_reserved_legacy_minus_partner
    FROM "InventoryLedger"
    WHERE "partnerId" = (SELECT id FROM gamal)
      AND "createdAt" > (SELECT reconcile_started_at FROM windows)
      AND NOT (id LIKE '${RECONCILE_LEDGER_PREFIX}%' AND notes = '${RECONCILE_NOTE}')
  `);

  const incidentBeforeBackfill = await raw(`
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
        il."quantityReservedDelta" AS reserved_delta,
        CASE
          WHEN v."createdAt" >= (SELECT initial_started_at FROM windows)
           AND v."createdAt" < (SELECT reconcile_started_at FROM windows)
          THEN 'invalid_admin_created_variant'
          ELSE 'invalid_admin_or_legacy_stock_edit_on_existing_variant'
        END AS bucket
      FROM "InventoryLedger" il
      JOIN "Variant" v ON v.id = il."variantId"
      WHERE il."partnerId" = (SELECT id FROM gamal)
        AND il.id LIKE '${RECONCILE_LEDGER_PREFIX}%'
        AND il.notes = '${RECONCILE_NOTE}'
    )
    SELECT
      bucket,
      count(*)::int AS variants,
      coalesce(sum(available_delta), 0)::int AS available_legacy_minus_partner_before_backfill,
      coalesce(sum(reserved_delta), 0)::int AS reserved_legacy_minus_partner_before_backfill,
      count(*) FILTER (WHERE available_delta > 0)::int AS variants_legacy_higher,
      coalesce(sum(available_delta) FILTER (WHERE available_delta > 0), 0)::int AS units_legacy_higher,
      count(*) FILTER (WHERE available_delta < 0)::int AS variants_legacy_lower,
      coalesce(sum(available_delta) FILTER (WHERE available_delta < 0), 0)::int AS units_legacy_lower
    FROM recon
    GROUP BY bucket
    ORDER BY bucket ASC
  `);

  const currentMismatchRows = await raw(`
    WITH gamal AS (
      SELECT id FROM "Partner" WHERE name = '${GAMAL_NAME}' LIMIT 1
    ),
    windows AS (
      SELECT started_at AS reconcile_started_at
      FROM "_prisma_migrations"
      WHERE migration_name = '${RECONCILE_MIGRATION}'
    ),
    valid_ledger AS (
      SELECT
        "variantId",
        coalesce(sum("quantityAvailableDelta"), 0)::int AS partner_available_delta,
        (coalesce(sum("quantityAvailableDelta"), 0) * -1)::int AS expected_available_legacy_minus_partner,
        coalesce(sum("quantityReservedDelta"), 0)::int AS partner_reserved_delta,
        (coalesce(sum("quantityReservedDelta"), 0) * -1)::int AS expected_reserved_legacy_minus_partner,
        string_agg(DISTINCT reason::text, ', ' ORDER BY reason::text) AS reasons
      FROM "InventoryLedger"
      WHERE "partnerId" = (SELECT id FROM gamal)
        AND "createdAt" > (SELECT reconcile_started_at FROM windows)
        AND NOT (id LIKE '${RECONCILE_LEDGER_PREFIX}%' AND notes = '${RECONCILE_NOTE}')
      GROUP BY "variantId"
    )
    SELECT
      v.sku,
      p.name AS product_name,
      v.name AS variant_name,
      v."colorName" AS color_name,
      v."stockAvailable" AS legacy_available,
      coalesce(pi."stockAvailable", 0) AS partner_available,
      v."stockAvailable" - coalesce(pi."stockAvailable", 0) AS available_legacy_minus_partner,
      coalesce(vl.expected_available_legacy_minus_partner, 0) AS expected_from_valid_partner_ledger,
      (
        v."stockAvailable"
        - coalesce(pi."stockAvailable", 0)
        - coalesce(vl.expected_available_legacy_minus_partner, 0)
      )::int AS unexplained_available_delta,
      coalesce(vl.reasons, '') AS valid_ledger_reasons
    FROM "Variant" v
    JOIN "Product" p ON p.id = v."productId"
    LEFT JOIN "PartnerInventory" pi
      ON pi."variantId" = v.id
     AND pi."partnerId" = (SELECT id FROM gamal)
    LEFT JOIN valid_ledger vl ON vl."variantId" = v.id
    WHERE v."stockAvailable" <> coalesce(pi."stockAvailable", 0)
       OR v."stockReserved" <> coalesce(pi."stockReserved", 0)
    ORDER BY abs(v."stockAvailable" - coalesce(pi."stockAvailable", 0)) DESC, v.sku ASC
  `);

  console.log(
    JSON.stringify(
      normalize({
        migrations,
        currentDrift,
        validLedgerTotals,
        validLedgerByReason,
        incidentBeforeBackfill,
        currentMismatchRows,
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
