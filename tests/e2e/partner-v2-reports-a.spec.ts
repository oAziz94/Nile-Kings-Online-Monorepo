import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";
// Pure, no `@/*` alias and no Prisma import inside `cairo-day.ts` itself — safe to import
// by relative path from a spec (unlike `lib/analytics/partner-reports.ts`, see the
// `noonDaysAgo` comment below).
import { addDaysIsoUtc, cairoYesterdayIso, dayIsoToDate } from "../../lib/analytics/cairo-day";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Backlog 5.6a (Partner portal v2 — Reports platform + Sales + Inventory) e2e coverage.
 * Replaces `tests/e2e/partner-reports.spec.ts` (backlog 4.22's v1 report) — that report's
 * screen and its `/api/partner/analytics` endpoints are superseded outright by the new
 * `/partner/reports/{sales,inventory}` platform and its own headline/comparison model; the
 * v1 spec is deleted in the same commit that adds this one (backlog 5.6a's own instruction).
 *
 * Serial mode: one seeded fixture pair, one seeded category/product, orders placed at
 * precise timestamps (via `resolvePeriod` itself, so the seed always lines up with
 * whatever "today" the suite runs on) across the current/previous 7-day windows, and one
 * inventory row for the reorder-formula + CSV round-trip checks.
 */
test.describe.configure({ mode: "serial" });
// Backlog 9.0d: a cold Turbopack server's first compile can push a save/PATCH well past
// Playwright's 30s default; 60s is this suite's floor.
test.setTimeout(60_000);

const prisma = new PrismaClient();
let pair: PartnerFixturePair;

const RUN_TAG = `e2e-5-6a-${Date.now()}`;
let categoryId: string;
let productId: string;
let salesVariantId: string;
let invVariantId: string;
let customerUserId: string;
const orderIds: string[] = [];

/**
 * Duplicates `resolvePeriod({ preset: "7d" })`'s current/previous window maths inline,
 * rather than importing `lib/analytics/partner-reports.ts` — that module (transitively)
 * imports `@/lib/db` via the `@/*` alias, which Playwright's own transform does not resolve
 * for files loaded outside Next's webpack build (the same reason `resolve-threshold.ts`
 * documents at its own top and defers to a dynamic `import()` — here there's nothing to
 * dynamically import around, since the hazard is the alias itself, not import timing).
 */
function noonDaysAgo(daysAgo: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d;
}

/** Same local-date convention as `resolvePeriod`'s `toIsoDate`, duplicated for the same
 * alias-avoidance reason as `noonDaysAgo` above. */
function isoDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `resolvePeriod({ preset: "7d" }).previous.to` — current.from is 6 days ago, so
 * `previous.to` (the day before current.from) is 7 days ago. */
function sevenDayPresetPreviousToIso(): string {
  return isoDaysAgo(7);
}

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma, { agent: { costRateBps: 7500 } });
  await prisma.partner.update({
    where: { id: pair.agent.partnerId },
    data: { targetCoverDays: 14, deadStockDays: 60 },
  });

  const category = await prisma.category.create({
    data: { name: `فئة 5.6a ${RUN_TAG}`, slug: `cat-5-6a-${RUN_TAG}` },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: { categoryId, name: `منتج 5.6a ${RUN_TAG}`, slug: `p-5-6a-${RUN_TAG}`, active: true },
  });
  productId = product.id;

  const salesVariant = await prisma.variant.create({
    data: { productId, sku: `SKU-SALES-${RUN_TAG}`, name: "M", pricePiastres: 10000 },
  });
  salesVariantId = salesVariant.id;

  const invVariant = await prisma.variant.create({
    data: { productId, sku: `SKU-INV-${RUN_TAG}`, name: "L", pricePiastres: 10000 },
  });
  invVariantId = invVariant.id;

  // sellable = 5 (20 available - 15 reserved), used by the inventory report's velocity/
  // reorder-formula assertions below.
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: invVariantId, stockAvailable: 20, stockReserved: 15 },
  });

  const customer = await prisma.user.create({
    data: { phone: `+2011${String(Date.now()).slice(-8)}`, role: "CUSTOMER" },
  });
  customerUserId = customer.id;

  const currentDate = noonDaysAgo(0); // "today" — inside the 7d preset's current window
  const previousDate = noonDaysAgo(10); // inside the 7d preset's previous window ([-13, -7])

  const baseAddress = {
    governorate: "القاهرة",
    city: "القاهرة",
    area: "test",
    street: "test",
    building: "1",
    floor: "1",
    apartment: "1",
    phone: "01000000000",
  };

  async function makeOrder(opts: {
    status: "DELIVERED" | "CANCELLED";
    totalPiastres: number;
    quantity: number;
    createdAt: Date;
    variantId: string;
    sku: string;
  }) {
    const order = await prisma.order.create({
      data: {
        userId: customerUserId,
        status: opts.status,
        subtotalPiastres: opts.totalPiastres,
        totalPiastres: opts.totalPiastres,
        shippingAddress: baseAddress,
        shippingProvider: "Egypt Post",
        paymentMethod: "COD",
        assignedPartnerId: pair.agent.partnerId,
        createdAt: opts.createdAt,
        items: {
          create: [
            {
              variantId: opts.variantId,
              productName: `منتج 5.6a ${RUN_TAG}`,
              variantName: "M",
              sku: opts.sku,
              quantity: opts.quantity,
              unitPricePiastres: opts.totalPiastres / opts.quantity,
              totalPiastres: opts.totalPiastres,
            },
          ],
        },
      },
    });
    orderIds.push(order.id);
  }

  // --- Sales report seed (current window: revenue 30000, orders 3, cancelled 1, units 5) ---
  await makeOrder({ status: "DELIVERED", totalPiastres: 10000, quantity: 2, createdAt: currentDate, variantId: salesVariantId, sku: `SKU-SALES-${RUN_TAG}` });
  await makeOrder({ status: "DELIVERED", totalPiastres: 20000, quantity: 3, createdAt: currentDate, variantId: salesVariantId, sku: `SKU-SALES-${RUN_TAG}` });
  await makeOrder({ status: "CANCELLED", totalPiastres: 5000, quantity: 1, createdAt: currentDate, variantId: salesVariantId, sku: `SKU-SALES-${RUN_TAG}` });
  // --- previous window: revenue 10000, orders 1, cancelled 0, units 1 ---
  await makeOrder({ status: "DELIVERED", totalPiastres: 10000, quantity: 1, createdAt: previousDate, variantId: salesVariantId, sku: `SKU-SALES-${RUN_TAG}` });

  // --- Inventory velocity seed: 14 units of invVariant sold (non-cancelled) in the current
  // 7-day window -> velocityPerDay = 2, sellable = 5, targetCoverDays = 14
  // -> suggestedReorder = ceil(14*2 - 5) = 23.
  await makeOrder({ status: "DELIVERED", totalPiastres: 100000, quantity: 14, createdAt: currentDate, variantId: invVariantId, sku: `SKU-INV-${RUN_TAG}` });

  // --- Backlog 7.5 — a snapshot row dated at the 7d preset's previous-period end, so the
  // inventory report's point-in-time headline tiles get a real comparison. Live sellable is
  // 5 (20 available - 15 reserved on invVariantId, this fixture's only PartnerInventory
  // row) -> previous 10 gives sellable a hand-computable -5 / -50% delta.
  //
  // Backlog 9.0 diagnosis (closed by 9.10): this test was red on `redesign` before 9.9 —
  // reproduced on a clean checkout of that commit, it failed the `deadStockCount`/
  // `stockOutSkus` assertions below. The test's own expectations were correct; the code
  // was not: before 9.9 retired the legacy Variant-level stock columns, this fixture's
  // `prisma.variant.create` calls still wrote `stockAvailable`/`stockReserved` (both 0)
  // alongside the real `PartnerInventory` row, and pre-9.9 order/stock plumbing (the
  // "Variant-level order stock service", 9.9's `34edbfa`) read stock through the Variant
  // columns in places `computePartnerStockTotals` (`lib/analytics/partner-stock-totals.ts`)
  // did not, producing a live sellable/dead-stock count that didn't match this file's hand
  // computation. 9.9 (`e334d9e`, `34edbfa`) dropped the legacy columns and the code path
  // that read them, so `computePartnerStockTotals`'s `PartnerInventory`-only read became the
  // single source of truth; this spec is green again as of `redesign`@`b2db23e` with no
  // further code or assertion change needed — verified cold and warm on port 3165 before
  // this comment was added. No test or lib change in this commit; recorded here per 9.10 so
  // the history isn't lost once 03-backlog.md's 9.0 entry is closed out.
  await prisma.partnerStockSnapshot.create({
    data: {
      partnerId: pair.agent.partnerId,
      day: dayIsoToDate(sevenDayPresetPreviousToIso()),
      sellableUnits: 10,
      reservedUnits: 5,
      valuationPiastres: BigInt(75000),
      valuationPricePiastres: BigInt(100000),
      coverDays: 4,
      deadStockSkus: 1,
      outOfStockSkus: 2,
    },
  });
});

test.afterAll(async () => {
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.partnerInventory.deleteMany({ where: { variantId: invVariantId } });
  await prisma.inventoryLedger.deleteMany({ where: { variantId: { in: [salesVariantId, invVariantId] } } });
  await prisma.partnerStockSnapshot.deleteMany({ where: { partnerId: { in: [pair.agent.partnerId, pair.distributor.partnerId] } } });
  await prisma.variant.deleteMany({ where: { productId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { id: customerUserId } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.$disconnect();
});

test("sales report: every headline and delta equals a hand computation", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  const res = await page.request.get("/api/partner/reports/sales?preset=7d", { headers: { accept: "application/json" } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  const headline: { key: string; value: number; previous: number; delta: { changeAbs: number; changePct: number | null; direction: string } }[] = json.data.headline;
  const byKey = Object.fromEntries(headline.map((h) => [h.key, h]));

  // The sales headline is partner-wide (not per-SKU) — it also picks up the inventory
  // report's own seeded order below (DELIVERED, 100000 piastres, qty 14, same window),
  // since both seeds share one partner. Hand computation over *all* of the partner's
  // orders in the current/previous 7-day windows:
  //   current: DELIVERED 10000+20000+100000=130000 (3 delivered), 1 CANCELLED (5000, excluded
  //     from revenue) -> orders=4, units=2+3+14=19, cancellationRate=1/4=25%
  //   previous: DELIVERED 10000 (1 delivered) -> orders=1, units=1
  expect(byKey.revenue.value).toBe(130000);
  expect(byKey.revenue.previous).toBe(10000);
  expect(byKey.revenue.delta.changePct).toBe(1200);
  expect(byKey.revenue.delta.direction).toBe("up");

  expect(byKey.orders.value).toBe(4);
  expect(byKey.orders.previous).toBe(1);
  expect(byKey.orders.delta.changePct).toBe(300);

  expect(byKey.units.value).toBe(19);
  expect(byKey.units.previous).toBe(1);

  expect(byKey.averageOrder.value).toBe(Math.round(130000 / 3)); // 3 delivered orders in period
  expect(byKey.averageOrder.previous).toBe(10000);

  expect(byKey.cancellationRate.value).toBeCloseTo(25, 5);
  expect(byKey.cancellationRate.previous).toBe(0);
  expect(byKey.cancellationRate.delta.changePct).toBeNull(); // previous is 0
  expect(byKey.cancellationRate.delta.changeAbs).toBeCloseTo(25, 5);

  // Product breakdown: our sales-test SKU's own row, independent of the other variant.
  const productRow = json.data.breakdowns.product.rows.find((r: { variantId: string }) => r.variantId === salesVariantId);
  expect(productRow.units).toBe(5);
  expect(productRow.revenuePiastres).toBe(30000);
  expect(productRow.revenueSharePct).toBeCloseTo((30000 / 130000) * 100, 5);

  // Governorate breakdown (backlog 7.4): every seeded order shares "القاهرة", so this row's
  // revenue equals the whole-partner headline above — 130000 now vs. 10000 previously ->
  // +120000, +1200%.
  const govRow = json.data.breakdowns.governorate.rows.find((r: { key: string }) => r.key === "القاهرة");
  expect(govRow).toBeTruthy();
  expect(govRow.revenuePiastres).toBe(130000);
  expect(govRow.previousRevenuePiastres).toBe(10000);
  expect(govRow.revenueDelta.direction).toBe("up");
  expect(govRow.revenueDelta.changeAbs).toBe(120000);
  expect(govRow.revenueDelta.changePct).toBe(1200);
});

test("sales report UI: the revenue tile renders the hand-computed value, and changing the preset changes the comparison", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/reports/sales");
  await expect(page.getByRole("heading", { name: "تقرير المبيعات" })).toBeVisible();

  // Default preset is 30d; the seed's orders (within the last 7 days) also fall inside a
  // 30d window, so its own comparison label is well-defined too.
  const comparisonLocator = page.locator("span", { hasText: "مقارنةً بـ" });
  await expect(comparisonLocator).toBeVisible({ timeout: 15_000 });
  const label30d = await comparisonLocator.textContent();

  await page.getByRole("button", { name: "7 أيام", exact: true }).click();
  await expect(page.getByText("1,300", { exact: false }).first()).toBeVisible({ timeout: 15_000 }); // 130,000 piastres -> 1,300 ج.م
  const label7d = await comparisonLocator.textContent();
  expect(label7d).not.toBe(label30d);

  // Governorate breakdown (backlog 7.4): the "مقارنة بالفترة السابقة" column renders the
  // same hand-computed +1200% this spec asserts against the API above.
  await page.getByRole("button", { name: "حسب المحافظة" }).click();
  const govRow = page.locator("tr", { hasText: "القاهرة" }).first();
  await expect(govRow).toBeVisible({ timeout: 15_000 });
  await expect(govRow.getByText("+1200%", { exact: true })).toBeVisible();
});

test("inventory report: velocity, days of cover and the reorder formula match the hand computation", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  const res = await page.request.get("/api/partner/reports/inventory?preset=7d&filter=all", {
    headers: { accept: "application/json" },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  const row = json.data.breakdowns.sku.rows.find((r: { variantId: string }) => r.variantId === invVariantId);
  expect(row).toBeTruthy();
  expect(row.sellable).toBe(5);
  expect(row.velocityPerWeek).toBeCloseTo(14, 5); // 2/day * 7
  expect(row.daysOfCover).toBeCloseTo(2.5, 5); // 5 / 2
  // ceil(targetCoverDays(14) * velocityPerDay(2) - sellable(5)) = ceil(23) = 23
  expect(row.suggestedReorder).toBe(23);

  await page.goto("/partner/reports/inventory");
  await page.getByRole("button", { name: "7 أيام", exact: true }).click();
  const tableRow = page.locator("tr", { hasText: `SKU-INV-${RUN_TAG}` }).or(page.locator("tr", { hasText: "منتج 5.6a" }));
  await expect(tableRow.first()).toBeVisible({ timeout: 15_000 });
  await expect(tableRow.first()).toContainText("23");
});

test("inventory report: point-in-time headline tiles compare against the seeded snapshot, and the stock-out-days tile is always present", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  const res = await page.request.get("/api/partner/reports/inventory?preset=7d&filter=all", {
    headers: { accept: "application/json" },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  const headline: {
    key: string;
    value: number;
    previous: number;
    delta: { changeAbs: number; changePct: number | null; direction: string };
    noComparison?: boolean;
    hint?: string;
  }[] = json.data.headline;
  expect(headline.length).toBe(7); // backlog 7.5 adds "أيام نفاد" as the 7th tile
  const byKey = Object.fromEntries(headline.map((h) => [h.key, h]));

  // Live sellable = 5 (20 available - 15 reserved on invVariantId, this fixture partner's
  // only PartnerInventory row); the seeded snapshot's sellableUnits is 10.
  expect(byKey.sellable.value).toBe(5);
  expect(byKey.sellable.previous).toBe(10);
  expect(byKey.sellable.noComparison).toBeFalsy();
  expect(byKey.sellable.delta.direction).toBe("down");
  expect(byKey.sellable.delta.changeAbs).toBe(-5);
  expect(byKey.sellable.delta.changePct).toBe(-50);
  expect(byKey.sellable.hint).toContain("مقارنةً بلقطة");

  // Cost valuation: live = 5 * round(10000 * 7500 / 10000) = 37500; snapshot = 75000.
  expect(byKey.valuationCost.value).toBe(37500);
  expect(byKey.valuationCost.previous).toBe(75000);
  expect(byKey.valuationCost.noComparison).toBeFalsy();

  // Price valuation: live = 5 * 10000 = 50000; snapshot = 100000 -> -50%.
  expect(byKey.valuationPrice.value).toBe(50000);
  expect(byKey.valuationPrice.previous).toBe(100000);
  expect(byKey.valuationPrice.delta.changePct).toBe(-50);
  expect(byKey.valuationPrice.noComparison).toBeFalsy();

  // Dead-stock / stock-out counts: live = 0 both (recent sale, sellable > 0); snapshot 1 / 2.
  expect(byKey.deadStockCount.value).toBe(0);
  expect(byKey.deadStockCount.previous).toBe(1);
  expect(byKey.stockOutSkus.value).toBe(0);
  expect(byKey.stockOutSkus.previous).toBe(2);

  // The seventh headline — ledger-accurate stock-out days — is always present, independent
  // of the snapshot; this fixture never wrote InventoryLedger rows, so it's 0 both periods.
  expect(byKey.stockOutDays).toBeTruthy();
  expect(byKey.stockOutDays.value).toBe(0);
  expect(byKey.stockOutDays.previous).toBe(0);
  expect(byKey.stockOutDays.noComparison).toBeFalsy();
  expect(byKey.stockOutDays.hint).toBe("مجموع أيام النفاد لكل الأصناف");
});

test("cron GET /api/cron/stock-snapshot: 401 without the bearer token", async ({ page }) => {
  const res = await page.request.get("/api/cron/stock-snapshot");
  expect(res.status()).toBe(401);
});

test("cron GET /api/cron/stock-snapshot: 200 with the bearer token, upserts yesterday's row, idempotent on rerun", async ({ page }) => {
  expect(CRON_SECRET, "CRON_SECRET must be set in this worktree's .env.redesign").toBeTruthy();
  const yesterdayIso = cairoYesterdayIso();

  const res1 = await page.request.get("/api/cron/stock-snapshot", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(res1.ok()).toBeTruthy();
  const json1 = await res1.json();
  expect(json1.data.day).toBe(yesterdayIso);
  expect(json1.data.written).toBeGreaterThan(0);

  const rowsAfterFirst = await prisma.partnerStockSnapshot.findMany({
    where: { partnerId: pair.agent.partnerId, day: dayIsoToDate(yesterdayIso) },
  });
  expect(rowsAfterFirst.length).toBe(1);
  // Our fixture partner's own PartnerInventory (invVariantId, sellable 5) is what the cron
  // wrote for yesterday.
  expect(rowsAfterFirst[0].sellableUnits).toBe(5);

  const res2 = await page.request.get("/api/cron/stock-snapshot", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(res2.ok()).toBeTruthy();
  const json2 = await res2.json();
  expect(json2.data.written).toBe(json1.data.written); // same active partners, same count

  const rowsAfterSecond = await prisma.partnerStockSnapshot.findMany({
    where: { partnerId: pair.agent.partnerId, day: dayIsoToDate(yesterdayIso) },
  });
  expect(rowsAfterSecond.length).toBe(1); // still exactly one row — upserted, not duplicated
  expect(rowsAfterSecond[0].id).toBe(rowsAfterFirst[0].id);

  // Cleanup: this cron run wrote real rows for every active partner in the database, not
  // just this fixture — only delete the one row this test is responsible for.
  await prisma.partnerStockSnapshot.deleteMany({ where: { partnerId: pair.agent.partnerId, day: dayIsoToDate(yesterdayIso) } });
});

test("cron GET /api/cron/stock-snapshot: prunes rows older than 400 days, keeps rows within it", async ({ page }) => {
  expect(CRON_SECRET).toBeTruthy();
  const yesterdayIso = cairoYesterdayIso();
  const oldDayIso = addDaysIsoUtc(yesterdayIso, -401);
  const keptDayIso = addDaysIsoUtc(yesterdayIso, -399);

  await prisma.partnerStockSnapshot.createMany({
    data: [
      { partnerId: pair.agent.partnerId, day: dayIsoToDate(oldDayIso), sellableUnits: 1, reservedUnits: 0, valuationPiastres: BigInt(0), deadStockSkus: 0, outOfStockSkus: 0 },
      { partnerId: pair.agent.partnerId, day: dayIsoToDate(keptDayIso), sellableUnits: 2, reservedUnits: 0, valuationPiastres: BigInt(0), deadStockSkus: 0, outOfStockSkus: 0 },
    ],
  });

  const res = await page.request.get("/api/cron/stock-snapshot", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.data.pruned).toBeGreaterThanOrEqual(1);

  const oldRow = await prisma.partnerStockSnapshot.findFirst({ where: { partnerId: pair.agent.partnerId, day: dayIsoToDate(oldDayIso) } });
  const keptRow = await prisma.partnerStockSnapshot.findFirst({ where: { partnerId: pair.agent.partnerId, day: dayIsoToDate(keptDayIso) } });
  expect(oldRow).toBeNull(); // 401-day-old row disappears
  expect(keptRow).toBeTruthy(); // 399-day-old row stays

  // Cleanup: the kept row, plus yesterday's row this same call also upserted.
  await prisma.partnerStockSnapshot.deleteMany({
    where: { partnerId: pair.agent.partnerId, day: { in: [dayIsoToDate(keptDayIso), dayIsoToDate(yesterdayIso)] } },
  });
});

test("the reorder CSV re-imports through the intake preview with zero row errors", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  const csvRes = await page.request.get("/api/partner/reports/inventory?preset=7d&export=reorder");
  expect(csvRes.ok()).toBeTruthy();
  const csvBuffer = await csvRes.body();
  expect(csvBuffer.toString("utf-8")).toContain(`SKU-INV-${RUN_TAG}`);

  const importRes = await page.request.post("/api/partner/inventory/import", {
    multipart: {
      mode: "receipt",
      file: {
        name: "reorder.csv",
        mimeType: "text/csv",
        buffer: csvBuffer,
      },
    },
  });
  expect(importRes.ok()).toBeTruthy();
  const importJson = await importRes.json();
  const rows: { sku: string; error?: string }[] = importJson.data.rows;
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((r) => !r.error)).toBe(true);
  const ourRow = rows.find((r) => r.sku === `SKU-INV-${RUN_TAG}`);
  expect(ourRow).toBeTruthy();
  expect(ourRow!.error).toBeUndefined();
});

test("settings: the two inventory-report fields load and save", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/settings");
  const deadStockInput = page.getByLabel("الراكد = بلا بيع (يوم)");
  const targetCoverInput = page.getByLabel("هدف أيام التغطية");
  await expect(deadStockInput).toHaveValue("60");
  await expect(targetCoverInput).toHaveValue("14");

  await targetCoverInput.fill("18");
  // Section order on the page: working profile (0) -> thresholds' override-save (1) ->
  // this inventory-report-settings section (2, `exact` avoids matching the thresholds
  // default-save button, whose accessible name is "حفظ الحد الافتراضي").
  await page.getByRole("button", { name: "حفظ", exact: true }).nth(2).click();
  await expect(page.getByText("تم حفظ إعدادات تقرير المخزون").first()).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("هدف أيام التغطية")).toHaveValue("18");

  // Restore for a clean second run of this spec against the same fixture invariants.
  await prisma.partner.update({ where: { id: pair.agent.partnerId }, data: { targetCoverDays: 14 } });
});

// Design-review screenshots (standing rule 16: verify against the artboards at these seven
// viewports). Not an assertion of pixel-parity — a fast artifact for manual review.
const VIEWPORTS: { name: string; width: number; height: number }[] = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1514x681", width: 1514, height: 681 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
];

test("screenshots: sales and inventory reports at every required viewport", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  for (const route of ["sales", "inventory"] as const) {
    await page.goto(`/partner/reports/${route}`);
    await expect(page.getByRole("heading", { name: route === "sales" ? "تقرير المبيعات" : "تقرير المخزون" })).toBeVisible({
      timeout: 15_000,
    });
    // Wait for the headline tiles' real data (not the loading skeleton) before shooting.
    await expect(page.locator(".nk-shimmer")).toHaveCount(0, { timeout: 20_000 });
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300); // let responsive layout settle
      await page.screenshot({ path: `screenshots/partner-reports-${route}-${vp.name}.png`, fullPage: true });
    }
  }
});
