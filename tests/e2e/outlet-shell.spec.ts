import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 11.2 — outlet portal shell: type-aware menu, the agent-only route guard, outlet
 * اليوم (KPIs from seeded StoreSale rows), and the store-profile settings round trip. The
 * DISTRIBUTOR side of `seedPartnerPair` is the outlet. Sales are seeded straight through
 * Prisma BEFORE login (11.3 owns the write path); `cleanupPartnerPair` removes the partner,
 * which cascades its StoreSale/StoreSaleItem rows, then this spec removes its own catalogue rows.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

const prisma = new PrismaClient();
let pair: PartnerFixturePair;
let categoryId: string;
let productId: string;
const variantIds: string[] = [];
const saleIds: Record<string, string> = {};
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma, { distributor: { lowStockThreshold: 5 } });

  const category = await prisma.category.create({
    data: { name: `فئة المنفذ ${suffix}`, slug: `outlet-cat-${suffix}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج المنفذ ${suffix}`, slug: `outlet-product-${suffix}`, active: true },
  });
  productId = product.id;

  const vA = await prisma.variant.create({ data: { productId, sku: `OUT-A-${suffix}`, name: "M", pricePiastres: 10_000 } });
  const vB = await prisma.variant.create({ data: { productId, sku: `OUT-B-${suffix}`, name: "L", pricePiastres: 5_000 } });
  variantIds.push(vA.id, vB.id);

  // sellable A = 12 - 2 = 10 (not low, value 10 x 100 = 1000 EGP); sellable B = 2 (low, value 100 EGP).
  await prisma.partnerInventory.create({
    data: { partnerId: pair.distributor.partnerId, variantId: vA.id, stockAvailable: 12, stockReserved: 2 },
  });
  await prisma.partnerInventory.create({
    data: { partnerId: pair.distributor.partnerId, variantId: vB.id, stockAvailable: 2, stockReserved: 0 },
  });

  const line = (variant: typeof vA, quantity: number) => ({
    variantId: variant.id,
    quantity,
    unitPricePiastres: variant.pricePiastres,
    productName: product.name,
    variantName: variant.name,
    sku: variant.sku,
  });
  const base = { partnerId: pair.distributor.partnerId, paymentMethod: "CASH" as const };

  // Two COMPLETED today (300 + 200 EGP, 3 + ... units) and one VOIDED that must not count.
  const s1 = await prisma.storeSale.create({
    data: { ...base, receiptNo: 1, status: "COMPLETED", subtotalPiastres: 30_000, items: { create: [line(vA, 2), line(vB, 1)] } },
  });
  const s2 = await prisma.storeSale.create({
    data: { ...base, receiptNo: 2, status: "COMPLETED", paymentMethod: "INSTAPAY", subtotalPiastres: 20_000, items: { create: [line(vA, 1)] } },
  });
  const s3 = await prisma.storeSale.create({
    data: {
      ...base,
      receiptNo: 3,
      status: "VOIDED",
      voidedAt: new Date(),
      voidReason: "اختبار",
      subtotalPiastres: 99_900,
      items: { create: [line(vA, 9)] },
    },
  });
  saleIds.s1 = s1.id;
  saleIds.s2 = s2.id;
  saleIds.s3 = s3.id;
});

test.afterAll(async () => {
  await cleanupPartnerPair(prisma, pair); // cascades the outlet's StoreSale + StoreSaleItem rows
  await prisma.variant.deleteMany({ where: safeWhere({ id: { in: variantIds } }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: { in: [productId] } }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: { in: [categoryId] } }) });
  await prisma.$disconnect();
});

test("outlet sees exactly the 5-item menu and none of the agent items", async ({ page }) => {
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner");
  const nav = page.getByRole("navigation", { name: "التنقل في لوحة الشريك" });
  for (const name of ["اليوم", "المبيعات", "المخزون", "التقارير", "الإعدادات"]) {
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  }
  for (const name of ["الطلبات", "الإشعارات", "المتجر"]) {
    await expect(nav.getByRole("link", { name, exact: true })).toHaveCount(0);
  }
  await expect(nav.getByRole("link", { name: "المبيعات", exact: true })).toHaveAttribute("href", "/partner/sales");
  await expect(page.getByText("منفذ ·").first()).toBeVisible(); // role label in the shell identity block

  // Owner 2026-10-19: the product stock page shows no "عرض الطلبات" column for an outlet (agents keep it).
  await page.goto(`/partner/stock/products/${productId}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("link", { name: "عرض الطلبات" })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "الطلبات المحجوزة" })).toHaveCount(0);
});

test("outlet is redirected from agent-only routes to /partner with a toast", async ({ page }) => {
  await loginAs(page, pair, "DISTRIBUTOR");
  for (const path of ["/partner/orders", "/partner/reports/money"]) {
    await page.goto(path);
    await page.waitForURL((url) => url.pathname === "/partner", { timeout: 15_000 });
    await expect(page.getByText("هذه الصفحة للوكلاء فقط").first()).toBeVisible();
  }
  // المبيعات resolves (placeholder until 11.3) and is not redirected.
  await page.goto("/partner/sales");
  await expect(page.getByRole("heading", { name: "المبيعات" }).first()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/partner/sales");
});

test("outlet اليوم: KPIs count the 2 COMPLETED sales, not the VOIDED one", async ({ page }) => {
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner");

  const sales = page.getByTestId("kpi-sales-today");
  await expect(sales).toContainText("500");
  await expect(sales).toContainText("2 إيصال");
  await expect(page.getByTestId("kpi-units-sold")).toContainText("4"); // 2 + 1 + 1, the voided 9 excluded
  await expect(page.getByTestId("kpi-stock-value")).toContainText("1,100");
  await expect(page.getByTestId("kpi-stock-alerts")).toContainText("1");

  // Queues: low stock yes; no order / SLA groups; latest receipts link to the sales log.
  await expect(page.getByTestId("queue-group-low-stock")).toBeVisible();
  for (const id of ["queue-group-to-confirm", "queue-group-overdue", "capacity-meter"]) {
    await expect(page.getByTestId(id)).toHaveCount(0);
  }
  await expect(page.getByTestId("receipt-row-1")).toHaveAttribute("href", `/partner/sales/${saleIds.s1}`);
  await expect(page.getByTestId("receipt-row-2")).toBeVisible();
  await expect(page.getByTestId("receipt-row-3")).toHaveCount(0); // voided receipts are not listed
  await expect(page.getByTestId("sales-sparkline")).toBeVisible();
});

test("outlet اليوم at 390px keeps the KPI grid and the mobile tab bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner");
  await expect(page.getByTestId("kpi-sales-today")).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "التنقل السريع" });
  await expect(tabs.getByRole("link")).toHaveCount(4);
  await expect(tabs.getByRole("link", { name: "المبيعات" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test("outlet settings: store profile round-trips, agent-only sections are hidden", async ({ page }) => {
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner/settings");

  await expect(page.getByLabel("نص أسفل الإيصال")).toHaveValue("شكراً لتسوقكم من قطن ملوك النيل");
  for (const hidden of ["ملف العمل", "طريقة التسليم", "حسابك مع المصنع"]) {
    await expect(page.getByText(hidden, { exact: true })).toHaveCount(0);
  }
  await expect(page.getByText("حدود المخزون").first()).toBeVisible();

  await page.getByLabel("اسم المنفذ").fill("منفذ النيل الاختباري");
  await page.getByLabel("العنوان").fill("١٢ شارع التحرير، الجيزة");
  await page.getByLabel("نص أسفل الإيصال").fill("مع تحيات منفذ النيل");
  await page.getByRole("button", { name: "حفظ" }).first().click();
  await expect(page.getByText("تم حفظ بيانات المنفذ").first()).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("اسم المنفذ")).toHaveValue("منفذ النيل الاختباري");
  await expect(page.getByLabel("العنوان")).toHaveValue("١٢ شارع التحرير، الجيزة");
  await expect(page.getByLabel("نص أسفل الإيصال")).toHaveValue("مع تحيات منفذ النيل");

  // Clearing the footer falls back to the default.
  await page.getByLabel("نص أسفل الإيصال").fill("");
  await page.getByRole("button", { name: "حفظ" }).first().click();
  await expect(page.getByText("تم حفظ بيانات المنفذ").first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("نص أسفل الإيصال")).toHaveValue("شكراً لتسوقكم من قطن ملوك النيل");
});

test("agent portal is unchanged, and the settings API rejects the store fields from an agent", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/stock");
  const nav = page.getByRole("navigation", { name: "التنقل في لوحة الشريك" });
  for (const name of ["اليوم", "الطلبات", "المخزون", "التقارير"]) {
    await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(nav.getByRole("link", { name: "المبيعات", exact: true })).toHaveCount(0);

  // The agent's orders page is still reachable (no redirect).
  await page.goto("/partner/orders");
  expect(new URL(page.url()).pathname).toBe("/partner/orders");

  const res = await page.request.patch("/api/partner/settings", { data: { storeName: "x" } });
  expect(res.status()).toBe(400);
  const ok = await page.request.patch("/api/partner/settings", { data: { lowStockThreshold: 5 } });
  expect(ok.status()).toBe(200);

  await page.goto("/partner/settings");
  await expect(page.getByText("ملف العمل").first()).toBeVisible();
  await expect(page.getByLabel("اسم المنفذ")).toHaveCount(0);
});
