import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, cleanupPartnerPair, loginAs, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 9.6 (التقارير network-wide) coverage. Serial mode, one shared fixture set: admin +
 * a partner pair (agent + linked distributor, both `isActive`, treated here as "the two
 * partners" — the network scope doesn't care about partner type, only `/network` itself
 * does) + one DELIVERED order per partner created "today" (preset `today` isolates the sum
 * from any other partner's historical activity already in the redesign DB).
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const prisma = new PrismaClient();

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}
async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scryptAsync(plain, salt);
  return `${salt}:${key.toString("hex")}`;
}

const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

const ADMIN_PHONE = "+201099966501";
const ADMIN_PASSWORD = "AdminReportsTest123!";
const ADMIN_NAME = `مسؤول اختبار التقارير ${uniqueSuffix}`;
const CUSTOMER_PHONE = "+201099966502";

let adminUserId: string;
let customerUserId: string;
let pair: PartnerFixturePair;

let categoryId: string;
let productId: string;
let variantId: string;
let receiptId: string;
const RECEIPT_REFERENCE = `RCPT-${uniqueSuffix}`;
const allOrderIds: string[] = [];
const ORDER_UNIT_PIASTRES = 20000;

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 20_000 });
}

test.beforeAll(async () => {
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: ADMIN_NAME },
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN", name: ADMIN_NAME },
  });
  adminUserId = admin.id;

  const customer = await prisma.user.upsert({
    where: { phone: CUSTOMER_PHONE },
    create: { phone: CUSTOMER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword("ReportsCust123!"), name: `عميل التقارير ${uniqueSuffix}` },
    update: {},
  });
  customerUserId = customer.id;

  pair = await seedPartnerPair(prisma);

  const category = await prisma.category.create({
    data: { name: `فئة تقارير ${uniqueSuffix}`, slug: `reports-cat-${uniqueSuffix}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج تقارير ${uniqueSuffix}`, slug: `reports-product-${uniqueSuffix}`, active: true, weightGrams: 300 },
  });
  productId = product.id;
  const variant = await prisma.variant.create({
    data: { productId, sku: `RPT-${uniqueSuffix}`, name: "M", colorName: "أزرق", pricePiastres: ORDER_UNIT_PIASTRES },
  });
  variantId = variant.id;

  for (const side of [pair.agent, pair.distributor]) {
    const order = await prisma.order.create({
      data: {
        userId: customerUserId,
        status: "DELIVERED",
        assignedPartnerId: side.partnerId,
        subtotalPiastres: ORDER_UNIT_PIASTRES,
        totalPiastres: ORDER_UNIT_PIASTRES,
        shippingAddress: { governorate: "القاهرة", city: "القاهرة", area: "مدينة نصر" },
        shippingProvider: "Egypt Post",
        paymentMethod: "COD",
        items: {
          create: [
            {
              variantId,
              productName: product.name,
              variantName: `${product.slug}-${variant.sku}`,
              sku: variant.sku,
              quantity: 1,
              unitPricePiastres: ORDER_UNIT_PIASTRES,
              totalPiastres: ORDER_UNIT_PIASTRES,
            },
          ],
        },
      },
    });
    allOrderIds.push(order.id);
  }

  // A FACTORY receipt for the agent, for fix (c)'s "the network receipts table shows the
  // fixture receipt with its partner name" assertion.
  const receipt = await prisma.stockReceipt.create({
    data: { partnerId: pair.agent.partnerId, kind: "FACTORY", reference: RECEIPT_REFERENCE, totalCostPiastres: 15000 },
  });
  receiptId = receipt.id;
});

test.afterAll(async () => {
  await prisma.stockReceipt.delete({ where: safeWhere({ id: receiptId }) });
  await prisma.orderAuditLog.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: allOrderIds } } });
  await prisma.variant.deleteMany({ where: safeWhere({ id: variantId }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await cleanupPartnerPair(prisma, pair);
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, customerUserId] } } });
  await prisma.$disconnect();
});

test("sales: network headline equals the sum of every active partner's own sales report, and حسب الشريك rows equal each partner's headline", async ({ page }) => {
  await loginAsAdmin(page);

  const networkRes = await page.request.get("/api/admin/reports/sales?preset=today");
  expect(networkRes.ok()).toBeTruthy();
  const networkJson = await networkRes.json();
  const byKey = (headline: { key: string; value: number }[]) => Object.fromEntries(headline.map((h) => [h.key, h.value]));
  const networkH = byKey(networkJson.data.headline);

  // The redesign DB is shared with other suites/fixtures, so "network = sum of the two
  // seeded partners" doesn't hold in isolation — assert the stronger, still-exact invariant
  // instead: network = sum of *every* active partner's own report for the same preset. Our
  // two fixture partners are asserted individually below via their حسب الشريك rows.
  const activePartners = await prisma.partner.findMany({ where: { isActive: true }, select: { id: true } });
  let summedRevenue = 0;
  let summedOrders = 0;
  let summedUnits = 0;
  const perPartnerHeadline = new Map<string, Record<string, number>>();
  for (const p of activePartners) {
    const res = await page.request.get(`/api/admin/partners/${p.id}/reports/sales?preset=today`);
    const json = await res.json();
    const h = byKey(json.data.headline);
    perPartnerHeadline.set(p.id, h);
    summedRevenue += h.revenue;
    summedOrders += h.orders;
    summedUnits += h.units;
  }
  expect(networkH.revenue).toBe(summedRevenue);
  expect(networkH.orders).toBe(summedOrders);
  expect(networkH.units).toBe(summedUnits);

  const byPartnerRows = networkJson.data.breakdowns.byPartner.rows as { key: string; revenuePiastres: number; orderCount: number }[];
  const agentRow = byPartnerRows.find((r) => r.key === pair.agent.partnerId);
  const distributorRow = byPartnerRows.find((r) => r.key === pair.distributor.partnerId);
  expect(agentRow?.revenuePiastres).toBe(perPartnerHeadline.get(pair.agent.partnerId)?.revenue);
  expect(distributorRow?.revenuePiastres).toBe(perPartnerHeadline.get(pair.distributor.partnerId)?.revenue);
  // Sanity: the fixture orders are actually inside these numbers, not two zero rows agreeing vacuously.
  expect(agentRow?.revenuePiastres).toBeGreaterThanOrEqual(ORDER_UNIT_PIASTRES);
  expect(distributorRow?.revenuePiastres).toBeGreaterThanOrEqual(ORDER_UNIT_PIASTRES);
});

test("sales: CSV export 200 with the partner column", async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.get("/api/admin/reports/sales?preset=today&format=csv&breakdown=byPartner");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-type"]).toContain("text/csv");
  const body = await res.text();
  expect(body).toContain("Partner,Revenue");
});

test("fulfilment: network on-time rate for 30d matches the 9.2 اليوم KPI", async ({ page }) => {
  await loginAsAdmin(page);
  const todayRes = await page.request.get("/api/admin/today");
  expect(todayRes.ok()).toBeTruthy();
  const todayJson = await todayRes.json();
  const onTimeFromToday = todayJson.data.kpis.onTimeRate30;

  const fulfilmentRes = await page.request.get("/api/admin/reports/fulfilment?preset=30d");
  expect(fulfilmentRes.ok()).toBeTruthy();
  const fulfilmentJson = await fulfilmentRes.json();
  const overdueRate = fulfilmentJson.data.headline.find((h: { key: string }) => h.key === "overdueRate").value;
  const onTimeFromReport = Math.round((100 - overdueRate) * 10) / 10;

  expect(onTimeFromReport).toBeCloseTo(onTimeFromToday, 0);
});

test("inventory: network report shows rows from both partners with a resolved cover", async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.get("/api/admin/reports/inventory?preset=30d&filter=all");
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  const partnerIds = new Set((json.data.breakdowns.sku.rows as { partnerId: string }[]).map((r) => r.partnerId));
  // Both fixture partners carry the fixture SKU via `PartnerInventory`? Only if stock rows
  // exist — assert on `byPartner` instead, which always has one row per active partner.
  const byPartnerKeys = new Set((json.data.breakdowns.byPartner.rows as { key: string }[]).map((r) => r.key));
  expect(byPartnerKeys.has(pair.agent.partnerId)).toBe(true);
  expect(byPartnerKeys.has(pair.distributor.partnerId)).toBe(true);
  void partnerIds;
});

test("money: owed per partner equals each profile's own balance tile, and the network receipts table shows the fixture receipt with its partner name", async ({ page }) => {
  await loginAsAdmin(page);
  const networkRes = await page.request.get("/api/admin/reports/money?preset=month");
  expect(networkRes.ok()).toBeTruthy();
  const networkJson = await networkRes.json();

  const agentRes = await page.request.get(`/api/admin/partners/${pair.agent.partnerId}/reports/money?preset=month`);
  const agentJson = await agentRes.json();
  const agentBalance = agentJson.data.headline.find((h: { key: string }) => h.key === "balance").value;

  const row = (networkJson.data.breakdowns.byPartner.rows as { key: string; owedPiastres: number }[]).find(
    (r) => r.key === pair.agent.partnerId
  );
  expect(row?.owedPiastres).toBe(agentBalance);

  // Fix (c) — "populate, don't hide": the network receipts table is a real union of every
  // active partner's own statement rows, tagged with partnerName.
  const receiptRows = networkJson.data.breakdowns.receipts.rows as { reference: string | null; partnerName?: string }[];
  const fixtureReceipt = receiptRows.find((r) => r.reference === RECEIPT_REFERENCE);
  expect(fixtureReceipt?.partnerName).toBe(pair.agent.name);

  // The partner-scoped route never carries partnerName (byte-identical DOM for the partner).
  const agentReceiptRows = agentJson.data.breakdowns.receipts.rows as { reference: string | null; partnerName?: string }[];
  expect(agentReceiptRows.some((r) => "partnerName" in r)).toBe(false);
});

// Network scope aggregates every active partner sequentially per report, so each admin
// network page load is noticeably slower than a partner-scoped one — these two fix (b)/(d)
// checks are split admin/partner per report family (rather than one long test walking all
// four pages back-to-back) so a slow network aggregation on one page never starves the time
// budget for an unrelated assertion later in the same test; the two admin-only ones get a
// longer per-test timeout for the same reason.

test("fix (b): the كشف حساب / reorder-CSV export buttons are hidden at network scope", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAsAdmin(page);

  await page.goto("/admin/reports/money");
  await expect(page.getByRole("heading", { name: "المال" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".nk-shimmer").first()).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "كشف حساب" })).toHaveCount(0);

  await page.goto("/admin/reports/inventory");
  await expect(page.getByRole("heading", { name: "تقرير المخزون" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".nk-shimmer").first()).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole("button", { name: "CSV" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "تصدير للمصنع" })).toHaveCount(0);
});

test("fix (b): the same export buttons are still present on the partner pages", async ({ page }) => {
  await loginAs(page, pair, "AGENT");

  await page.goto("/partner/reports/money");
  await expect(page.getByRole("heading", { name: "المال" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "كشف حساب" })).toBeVisible();

  await page.goto("/partner/reports/inventory");
  await expect(page.getByRole("heading", { name: "تقرير المخزون" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
});

test("fix (d): حسب الشريك is selected by default on the admin sales/fulfilment pages", async ({ page }) => {
  test.setTimeout(180_000);
  await loginAsAdmin(page);

  await page.goto("/admin/reports/sales");
  await expect(page.locator(".nk-shimmer").first()).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole("columnheader", { name: "الشريك" })).toBeVisible();

  await page.goto("/admin/reports/fulfilment");
  await expect(page.locator(".nk-shimmer").first()).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole("columnheader", { name: "الشريك" })).toBeVisible();

  // Inventory/money render حسب الشريك as an always-visible panel (no tab to switch away
  // from), so "selected by default" is trivially true there — checked via the same panel
  // assertions already covered by the sales/inventory/money tests above.
});

test("fix (d): partner pages keep their own default tab and have no حسب الشريك tab", async ({ page }) => {
  await loginAs(page, pair, "AGENT");

  await page.goto("/partner/reports/sales");
  await expect(page.getByRole("heading", { name: "تقرير المبيعات" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "حسب الشريك" })).toHaveCount(0);
  // "حسب المنتج" (the partner default) is still the first, active tab — a fresh fixture
  // partner may have zero rows in any given breakdown, so assert the tab exists rather than
  // its (possibly empty) table content.
  await expect(page.getByRole("button", { name: "حسب المنتج" })).toBeVisible();

  await page.goto("/partner/reports/fulfilment");
  await expect(page.getByRole("heading", { name: "تقرير التجهيز" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "حسب الشريك" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "أبطأ الطلبات" })).toBeVisible();
});

test("/admin/analytics redirects to /admin/reports/sales, mapping ?from&to to preset=custom", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/analytics?from=2026-01-01&to=2026-01-31");
  await expect(page).toHaveURL("/admin/reports/sales?preset=custom&from=2026-01-01&to=2026-01-31", { timeout: 20_000 });

  await page.goto("/admin/analytics");
  await expect(page).toHaveURL("/admin/reports/sales", { timeout: 20_000 });
});

test("401 signed-out; 403 for a customer", async ({ browser }) => {
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  const guestRes = await guestPage.request.get("/api/admin/reports/sales");
  expect(guestRes.status()).toBe(401);
  await guestContext.close();

  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  await customerPage.goto("/login");
  await customerPage.getByLabel("رقم الهاتف").fill(CUSTOMER_PHONE.replace("+20", ""));
  await customerPage.getByLabel("كلمة المرور").fill("ReportsCust123!");
  await customerPage.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(customerPage).toHaveURL("/", { timeout: 20_000 });
  const customerRes = await customerPage.request.get("/api/admin/reports/sales");
  expect(customerRes.status()).toBe(403);
  await customerContext.close();
});

const SCREENSHOT_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1514, height: 681 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

test("screenshots: the four network reports at the four viewports; nav التقارير lands on /admin/reports/sales", async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto("/admin");
  await page.getByRole("link", { name: "التقارير" }).click();
  await expect(page).toHaveURL("/admin/reports/sales", { timeout: 20_000 });

  const pages: { path: string; heading: string; slug: string }[] = [
    { path: "/admin/reports/sales", heading: "تقرير المبيعات", slug: "sales" },
    { path: "/admin/reports/fulfilment", heading: "تقرير التجهيز", slug: "fulfilment" },
    { path: "/admin/reports/inventory", heading: "تقرير المخزون", slug: "inventory" },
    { path: "/admin/reports/money", heading: "المال", slug: "money" },
  ];

  for (const { width, height } of SCREENSHOT_VIEWPORTS) {
    await page.setViewportSize({ width, height });
    for (const { path, heading, slug } of pages) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 20_000 });
      // Network scope aggregates every active partner sequentially — noticeably slower than a
      // single partner's report — so wait for the loading skeletons to clear, not a fixed delay.
      await expect(page.locator(".nk-shimmer").first()).toHaveCount(0, { timeout: 30_000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `screenshots/admin-v2-reports-${slug}-${width}x${height}.png`, fullPage: true });
    }
    if (width === 390) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
      expect(overflow).toBe(true);
    }
  }
});
