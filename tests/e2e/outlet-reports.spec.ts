import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import { seedPartnerPair, cleanupPartnerPair, loginAs, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";
import { cairoStartOfDayUtc } from "../../lib/analytics/cairo-day";

/**
 * Backlog 11.5 (outlet reports). Fixtures are this spec's own: an AGENT + outlet pair, two
 * products (one variant each) stocked at the outlet (v1 20 units at 100 EGP, v2 10 units at
 * 250 EGP) and StoreSale rows written directly with controlled `soldAt`:
 *   current 7d window - yesterday 10:05 CASH  v1 x2            200 EGP
 *                       yesterday 15:05 INSTAPAY v2 x1         250 EGP
 *                       today     11:05 CARD v1 x1             100 EGP
 *   previous window   - 9 days ago 12:05 CASH v1 x1            100 EGP
 *   a VOIDED sale today with a big v1 line (must change nothing).
 * So revenue is 550 vs 100 (+450%), receipts 3 vs 1, units 4 vs 1, average 183.33 vs 100.
 * Over 30d, v1 sold 4 units (cover 20 / (4/30) = 150 days) and v2 sold 1 (cover 300 days).
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const prisma = new PrismaClient();
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

let pair: PartnerFixturePair;
let categoryId: string;
const productIds: string[] = [];
let v1: string;
let v2: string;
const nameA = `قميص التقارير ${suffix}`;
const nameB = `بنطلون التقارير ${suffix}`;

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoOf(d);
};
const cairoAt = (iso: string, hour: number) => new Date(cairoStartOfDayUtc(iso).getTime() + hour * 3_600_000 + 5 * 60_000);

async function addSale(
  receiptNo: number,
  soldAt: Date,
  paymentMethod: "CASH" | "INSTAPAY" | "CARD",
  lines: { variantId: string; quantity: number; unit: number; name: string; sku: string }[],
  status: "COMPLETED" | "VOIDED" = "COMPLETED"
) {
  await prisma.storeSale.create({
    data: {
      partnerId: pair.distributor.partnerId,
      receiptNo,
      status,
      paymentMethod,
      soldAt,
      subtotalPiastres: lines.reduce((s, l) => s + l.quantity * l.unit, 0),
      voidedAt: status === "VOIDED" ? soldAt : null,
      voidReason: status === "VOIDED" ? "fixture" : null,
      items: {
        create: lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          unitPricePiastres: l.unit,
          productName: l.name,
          variantName: "M",
          sku: l.sku,
        })),
      },
    },
  });
}

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma);
  categoryId = (await prisma.category.create({ data: { name: `فئة التقارير ${suffix}`, slug: `rep-cat-${suffix}` } })).id;
  const pA = await prisma.product.create({ data: { categoryId, name: nameA, slug: `rep-a-${suffix}`, active: true } });
  const pB = await prisma.product.create({ data: { categoryId, name: nameB, slug: `rep-b-${suffix}`, active: true } });
  productIds.push(pA.id, pB.id);
  v1 = (await prisma.variant.create({ data: { productId: pA.id, sku: `REP-A-${suffix}`, name: "M", colorName: "أحمر", pricePiastres: 10000 } })).id;
  v2 = (await prisma.variant.create({ data: { productId: pB.id, sku: `REP-B-${suffix}`, name: "M", colorName: "أزرق", pricePiastres: 25000 } })).id;
  await prisma.partnerInventory.create({ data: { partnerId: pair.distributor.partnerId, variantId: v1, stockAvailable: 20, stockReserved: 0 } });
  await prisma.partnerInventory.create({ data: { partnerId: pair.distributor.partnerId, variantId: v2, stockAvailable: 10, stockReserved: 0 } });

  const l1 = (q: number) => ({ variantId: v1, quantity: q, unit: 10000, name: nameA, sku: `REP-A-${suffix}` });
  const l2 = (q: number) => ({ variantId: v2, quantity: q, unit: 25000, name: nameB, sku: `REP-B-${suffix}` });
  await addSale(1, cairoAt(daysAgo(1), 10), "CASH", [l1(2)]);
  await addSale(2, cairoAt(daysAgo(1), 15), "INSTAPAY", [l2(1)]);
  await addSale(3, cairoAt(daysAgo(0), 11), "CARD", [l1(1)]);
  await addSale(4, cairoAt(daysAgo(9), 12), "CASH", [l1(1)]);
  await addSale(5, cairoAt(daysAgo(0), 12), "CASH", [l1(50)], "VOIDED");
});

test.afterAll(async () => {
  const partnerId = pair.distributor.partnerId;
  await prisma.storeSaleItem.deleteMany({ where: safeWhere({ sale: { partnerId } }) });
  await prisma.storeSale.deleteMany({ where: safeWhere({ partnerId }) });
  await prisma.inventoryLedger.deleteMany({ where: safeWhere({ variantId: { in: [v1, v2] } }) });
  await prisma.partnerInventory.deleteMany({ where: safeWhere({ variantId: { in: [v1, v2] } }) });
  await prisma.variant.deleteMany({ where: safeWhere({ id: { in: [v1, v2] } }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: { in: productIds } }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await cleanupPartnerPair(prisma, pair);
  await prisma.$disconnect();
});

const tile = (page: import("@playwright/test").Page, title: string) =>
  page.getByText(title, { exact: true }).first().locator("xpath=ancestor::div[contains(@class,'shadow-soft')][1]");

test("sales report: KPIs with comparison arrows, voided sale excluded, by-product rows", async ({ page }) => {
  await page.setViewportSize({ width: 1514, height: 681 });
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner/reports/sales");
  await page.getByRole("button", { name: "7 أيام" }).click();

  await expect(page.getByRole("heading", { name: "تقرير المبيعات" })).toBeVisible();
  const revenue = tile(page, "الإيراد");
  await expect(revenue).toContainText("550", { timeout: 15_000 });
  await expect(revenue).toContainText("+450%");
  const receipts = tile(page, "الإيصالات");
  await expect(receipts).toContainText("3");
  await expect(receipts).toContainText("+200%");
  const units = tile(page, "القطع");
  await expect(units).toContainText("4");
  await expect(units).toContainText("+300%");
  const average = tile(page, "متوسط الإيصال");
  await expect(average).toContainText("183.33");
  await expect(average).toContainText("+83%");
  await expect(page.getByText("مقارنةً بـ")).toBeVisible();

  // By product (default tab): two products, A ahead of B? A = 300 EGP, B = 250 EGP.
  const rows = page.locator('[data-testid="outlet-breakdown-product"] tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText(nameA);
  await expect(rows.nth(0)).toContainText("300");
  await expect(rows.nth(0)).toContainText("+200%"); // previous 100 -> 300
  await expect(rows.nth(1)).toContainText(nameB);
  await expect(rows.nth(1)).toContainText("جديد");

  // Table views: payment methods in the fixed order, hours and days.
  await page.getByRole("button", { name: "حسب طريقة الدفع" }).click();
  const pay = page.locator('[data-testid="outlet-breakdown-payment"] tbody tr');
  await expect(pay).toHaveCount(3);
  await expect(pay.nth(0)).toContainText("نقدي");
  await expect(pay.nth(1)).toContainText("إنستاباي");
  await expect(pay.nth(2)).toContainText("بطاقة");
  await page.getByRole("button", { name: "حسب اليوم" }).click();
  await expect(page.locator('[data-testid="outlet-breakdown-day"] tbody tr')).toHaveCount(2);
  await page.getByRole("button", { name: "حسب الساعة" }).click();
  await expect(page.locator('[data-testid="outlet-breakdown-hour"] tbody tr')).toHaveCount(3);

  // Ranked bar lists carry direct labels.
  await expect(page.getByLabel("أفضل ساعات البيع").getByTestId("bar-list-row")).toHaveCount(3);

  fs.mkdirSync("test-results/11.5", { recursive: true });
  await page.screenshot({ path: "test-results/11.5/sales-1514x681.png", fullPage: true });
});

test("sales report API: voided sales and other partners excluded, CSV row count", async ({ page }) => {
  await loginAs(page, pair, "DISTRIBUTOR");
  const res = await page.request.get("/api/partner/reports/sales?preset=7d");
  expect(res.status()).toBe(200);
  const { data } = await res.json();
  const h = Object.fromEntries((data.headline as { key: string; value: number; previous: number }[]).map((x) => [x.key, x]));
  expect(h.revenue.value).toBe(55000);
  expect(h.revenue.previous).toBe(10000);
  expect(h.receipts.value).toBe(3);
  expect(h.units.value).toBe(4);
  expect(data.series[0].points).toHaveLength(7);

  const csv = await page.request.get("/api/partner/reports/sales?preset=7d&format=csv&breakdown=product");
  expect(csv.status()).toBe(200);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  const lines = (await csv.text()).replace(/^﻿/, "").trim().split("\n");
  expect(lines).toHaveLength(1 + 2);

  const days = await page.request.get("/api/partner/reports/sales?preset=7d&format=csv&breakdown=day");
  expect((await days.text()).trim().split("\n")).toHaveLength(1 + 2);

  const badKey = await page.request.get("/api/partner/reports/sales?preset=7d&format=csv&breakdown=governorate");
  expect(badKey.status()).toBe(400);
});

test("inventory report: cover days derive from store sales, not online orders", async ({ page }) => {
  await loginAs(page, pair, "DISTRIBUTOR");
  const res = await page.request.get("/api/partner/reports/inventory?preset=30d&filter=all");
  expect(res.status()).toBe(200);
  const { data } = await res.json();
  const rows = data.breakdowns.sku.rows as { variantId: string; sellable: number; daysOfCover: number | null; velocityPerWeek: number; isDead: boolean }[];
  const r1 = rows.find((r) => r.variantId === v1)!;
  const r2 = rows.find((r) => r.variantId === v2)!;
  // v1: 20 sellable, 4 units in 30 days (voided 50 ignored) -> 150 days. v2: 10 sellable, 1 unit -> 300 days.
  expect(r1.sellable).toBe(20);
  expect(r1.daysOfCover).toBeCloseTo(150, 5);
  expect(r1.velocityPerWeek).toBeCloseTo((4 / 30) * 7, 5);
  expect(r2.daysOfCover).toBeCloseTo(300, 5);
  expect(r1.isDead).toBe(false);

  await page.setViewportSize({ width: 1514, height: 681 });
  await page.goto("/partner/reports/inventory");
  await page.getByRole("button", { name: "الكل" }).click();
  const row = page.getByRole("row").filter({ hasText: `REP-A-${suffix}` });
  await expect(row).toContainText("150", { timeout: 15_000 });
  await page.screenshot({ path: "test-results/11.5/inventory-1514x681.png", fullPage: true });
});

test("outlet hub shows only المبيعات and المخزون; agent hub keeps all five; fulfilment, network, money answer 403", async ({ page, browser }) => {
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner/reports/inventory");
  const nav = page.getByRole("navigation", { name: "التقارير" });
  await expect(nav.getByRole("link", { name: "المبيعات" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "المخزون" })).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(2);

  for (const family of ["fulfilment", "network", "money"]) {
    const res = await page.request.get(`/api/partner/reports/${family}`);
    expect(res.status(), family).toBe(403);
  }

  const ctx = await browser.newContext();
  const agentPage = await ctx.newPage();
  await loginAs(agentPage, pair, "AGENT");
  await agentPage.goto("/partner/reports/sales");
  await expect(agentPage.getByRole("navigation", { name: "التقارير" }).getByRole("link")).toHaveCount(5);
  expect((await agentPage.request.get("/api/partner/reports/fulfilment")).status()).toBe(200);
  // The agent's sales report still reads online orders: the outlet's receipts are invisible to it.
  const agentSales = await agentPage.request.get("/api/partner/reports/sales?preset=7d");
  expect(agentSales.status()).toBe(200);
  const body = await agentSales.json();
  expect(body.data.breakdowns.byPartner).toBeNull();
  expect(body.data.headline.map((x: { key: string }) => x.key)).toContain("cancellationRate");
  await ctx.close();
});

test("phone viewport: report stacks without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner/reports/sales");
  await page.getByRole("button", { name: "7 أيام" }).click();
  await expect(tile(page, "الإيراد")).toContainText("550", { timeout: 15_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/11.5/sales-390x844.png", fullPage: true });

  await page.goto("/partner/reports/inventory");
  await expect(page.getByRole("heading", { name: "تقرير المخزون" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "test-results/11.5/inventory-390x844.png", fullPage: true });
});
