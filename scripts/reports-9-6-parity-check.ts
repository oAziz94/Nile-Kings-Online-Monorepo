/**
 * Backlog 9.6 "Parity check before the delete" (read-only) — for one fixed custom period on
 * the redesign DB, prints the v1 admin analytics KPIs (`getKpis`) side by side with the new
 * network sales report's headline for the same period, so any difference can be explained by
 * definition before `app/api/admin/analytics/route.ts` is deleted.
 *
 * Safety (docs/redesign/04-decisions.md incident 2026-09-12): this file constructs a
 * PrismaClient, so it is only ever run as
 *   node --env-file=.env.redesign -r ts-node/register scripts/reports-9-6-parity-check.ts
 * (or `npx tsx --env-file=.env.redesign scripts/reports-9-6-parity-check.ts`) from the
 * worktree root — never plain `node`/`npx tsx` without `--env-file`, which would fall back to
 * Prisma's own `.env` auto-load (production). The assertion below aborts immediately if the
 * loaded DATABASE_URL's host is production's, mirroring `tests/e2e/test-env.ts`'s guard.
 * Read-only: no writes, no deletes.
 */
import { PrismaClient } from "@prisma/client";

const PRODUCTION_DB_HOST_PREFIX = "ep-hidden-butterfly-agp3sg0e";
const REDESIGN_DB_HOST_PREFIX = "ep-mute-poetry-agss66i6";

function assertNotProduction(): void {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — refusing to run without a loaded env.");
  }
  const host = new URL(url).hostname;
  if (host === PRODUCTION_DB_HOST_PREFIX || host.startsWith(PRODUCTION_DB_HOST_PREFIX)) {
    throw new Error(`Refusing to run: DATABASE_URL points at production (${host}).`);
  }
  if (!host.startsWith(REDESIGN_DB_HOST_PREFIX)) {
    throw new Error(
      `Refusing to run: DATABASE_URL host (${host}) is not the redesign branch (${REDESIGN_DB_HOST_PREFIX}). ` +
        `Run with --env-file=.env.redesign.`
    );
  }
  console.log(`[parity-check] DATABASE_URL host verified as redesign branch: ${host}`);
}

assertNotProduction();

const prisma = new PrismaClient();

// A fixed custom period, wide enough to contain real historical data in the redesign DB.
const FROM = "2026-01-01";
const TO = "2026-09-13";

async function main() {
  const { getKpis } = await import("../lib/analytics/queries");
  const { getPartnerSalesReport } = await import("../lib/analytics/partner-sales-report");

  const v1 = await getKpis(FROM, TO);
  const v2 = await getPartnerSalesReport({ network: true }, { preset: "custom", from: FROM, to: TO });

  const v2ByKey = Object.fromEntries(v2.headline.map((h) => [h.key, h.value]));
  const v1Aov = v1.orderCount > 0 ? Math.round(v1.totalRevenuePiastres / v1.orderCount) : 0;
  const v2Aov = v2ByKey.averageOrder;

  console.log(`\nPeriod: ${FROM} .. ${TO}\n`);
  console.log("v1 (lib/analytics/queries.ts getKpis, DELIVERED-only):");
  console.log(`  revenue (piastres): ${v1.totalRevenuePiastres}`);
  console.log(`  orders (DELIVERED-only count): ${v1.orderCount}`);
  console.log(`  AOV (revenue / DELIVERED orders): ${v1Aov}`);

  console.log("\nv2 (lib/analytics/partner-sales-report.ts getPartnerSalesReport, network scope):");
  console.log(`  revenue (piastres, DELIVERED-only): ${v2ByKey.revenue}`);
  console.log(`  orders (ALL statuses count): ${v2ByKey.orders}`);
  console.log(`  averageOrder (DELIVERED-only): ${v2Aov}`);

  console.log("\nDiff:");
  console.log(`  revenue diff: ${v2ByKey.revenue - v1.totalRevenuePiastres} (expect 0 — both DELIVERED-only)`);
  console.log(
    `  orders diff: ${v2ByKey.orders - v1.orderCount} (expect >= 0 — v1 counts DELIVERED only, v2's "orders" headline counts every status by design, documented in partner-sales-report.ts's header comment)`
  );
  console.log(`  AOV diff: ${v2Aov - v1Aov} (expect ~0 — both are revenue / DELIVERED-order-count)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
