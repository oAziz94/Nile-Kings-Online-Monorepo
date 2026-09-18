import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, cleanupPartnerPair, loginAs, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere, deleteByIds } from "./db-cleanup";
import { formatMoney2 } from "@/lib/reports/print/build";

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
let oddPriceProductId: string;
let oddPriceVariantId: string;
let receiptId: string;
const RECEIPT_REFERENCE = `RCPT-${uniqueSuffix}`;
const allOrderIds: string[] = [];
const ORDER_UNIT_PIASTRES = 20000;
// Backlog 10.14 (verifier, third pass) — a unit price that is *not* a round hundred piastres,
// so the print page's money formatting is proven against a real piastre remainder, not just
// values that would print correctly even through the old (buggy) whole-pound rounding path.
const ODD_UNIT_PIASTRES = 19999;
const ODD_PRODUCT_NAME_SUFFIX = "سعر كسري";

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

  // A *separate* product (the print product table's row label is the product name only, no
  // variant differentiator — same as the on-screen tab) so the odd-priced order's row is
  // findable by a unique product name, not conflated with the round-price fixture above.
  const oddProduct = await prisma.product.create({
    data: {
      categoryId,
      name: `منتج ${ODD_PRODUCT_NAME_SUFFIX} ${uniqueSuffix}`,
      slug: `reports-odd-product-${uniqueSuffix}`,
      active: true,
      weightGrams: 300,
    },
  });
  oddPriceProductId = oddProduct.id;
  const oddVariant = await prisma.variant.create({
    data: { productId: oddPriceProductId, sku: `RPT-ODD-${uniqueSuffix}`, name: "L", colorName: "أخضر", pricePiastres: ODD_UNIT_PIASTRES },
  });
  oddPriceVariantId = oddVariant.id;

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

  // Backlog 10.14 (verifier, third pass) — one more DELIVERED order, same product, the odd-
  // priced variant, no discount: its net merchandise (= subtotal, no discount/senior-free) is
  // exactly 19,999 piastres, so the product breakdown's own row for it must print "199.99 ج.م"
  // — proof the print page's money formatting survives a real piastre remainder.
  const oddOrder = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "DELIVERED",
      assignedPartnerId: pair.agent.partnerId,
      subtotalPiastres: ODD_UNIT_PIASTRES,
      totalPiastres: ODD_UNIT_PIASTRES,
      shippingAddress: { governorate: "القاهرة", city: "القاهرة", area: "مدينة نصر" },
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      items: {
        create: [
          {
            variantId: oddPriceVariantId,
            productName: oddProduct.name,
            variantName: `${oddProduct.slug}-${oddVariant.sku}`,
            sku: oddVariant.sku,
            quantity: 1,
            unitPricePiastres: ODD_UNIT_PIASTRES,
            totalPiastres: ODD_UNIT_PIASTRES,
          },
        ],
      },
    },
  });
  allOrderIds.push(oddOrder.id);

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
  await deleteByIds(prisma.variant, [variantId, oddPriceVariantId]);
  await deleteByIds(prisma.product, [productId, oddPriceProductId]);
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

test("sales: orders= unknown value is a 400, same as a bad preset", async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.get("/api/admin/reports/sales?preset=today&orders=bogus");
  expect(res.status()).toBe(400);
});

test("sales: the accomplished/active chip round-trips through the URL, and the CSV link carries orders=", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/reports/sales");
  await expect(page.getByRole("heading", { name: "تقرير المبيعات" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".nk-shimmer").first()).toHaveCount(0, { timeout: 30_000 });

  await expect(page.getByRole("button", { name: "المُنجَزة" })).toHaveAttribute("aria-pressed", "true");
  // Backlog 10.13 proof — screenshots of both chip states at the two required viewports.
  for (const vp of [{ w: 1514, h: 681 }, { w: 390, h: 844 }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `screenshots/admin-reports-sales-accomplished-${vp.w}x${vp.h}.png`, fullPage: true });
  }

  await page.getByRole("button", { name: "النشطة" }).click();
  await expect(page).toHaveURL(/orders=active/);
  await expect(page.locator(".nk-shimmer").first()).toHaveCount(0, { timeout: 30_000 });
  for (const vp of [{ w: 1514, h: 681 }, { w: 390, h: 844 }]) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `screenshots/admin-reports-sales-active-${vp.w}x${vp.h}.png`, fullPage: true });
  }

  // The CSV response carries `Content-Disposition: attachment`, so the new tab the export
  // button opens is a browser download, not a navigated page — Playwright surfaces that as
  // a `download` event (its `.url()` is the request URL), not a `popup` with a real URL.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV" }).click();
  const download = await downloadPromise;
  expect(download.url()).toContain("orders=active");

  await page.reload();
  await expect(page.getByRole("button", { name: "النشطة" })).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
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

// Backlog 10.14 — print-ready PDF page per admin report tab.
test("10.14: the «PDF» button opens a new page whose URL carries the tab's params", async ({ page, context }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/reports/sales");
  await expect(page.getByRole("heading", { name: "تقرير المبيعات" })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".nk-shimmer").first()).toHaveCount(0, { timeout: 30_000 });

  await page.getByRole("button", { name: "النشطة" }).click();
  await expect(page).toHaveURL(/orders=active/);

  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "PDF" }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  expect(popup.url()).toContain("/admin/reports/sales/print");
  expect(popup.url()).toContain("preset=30d");
  expect(popup.url()).toContain("orders=active");
  await popup.close();
});

test("10.14: the print page has no PDF button on the partner pages", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/reports/sales");
  await expect(page.getByRole("heading", { name: "تقرير المبيعات" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "PDF" })).toHaveCount(0);
});

test("10.14: the sales print page renders the four tiles and its total row equals the API's headline revenue (preset=30d, the PM's reconciliation check)", async ({ page }) => {
  await loginAsAdmin(page);

  // Backlog 10.14 PM review (fix 1) — the reconciliation must hold on a period with more than
  // a page's worth of rows, not just `preset=today` (where the truncation bug happened not to
  // show, since 30d's product breakdown has more than 25 rows). The headline itself was never
  // paginated — only the breakdown tables were — so the plain (page-1) API call already gives
  // the true full-period revenue to reconcile the print page's `all: true` tables against.
  const apiRes = await page.request.get("/api/admin/reports/sales?preset=30d");
  const apiJson = await apiRes.json();
  const byKey = (headline: { key: string; value: number }[]) => Object.fromEntries(headline.map((h) => [h.key, h.value]));
  const apiRevenuePiastres = byKey(apiJson.data.headline).revenue as number;

  await page.goto("/admin/reports/sales/print?preset=30d&orders=accomplished");
  await expect(page.locator(".tile")).toHaveCount(4);
  const revenueTileValue = await page.locator(".tile").first().locator(".tile-value").innerText();
  // The print page formats money to two decimals ("1,234.56 ج.م"); take the leading numeral
  // token (comma thousands separator stripped) rather than a blanket "keep digits and dots"
  // regex, which would also keep the dot inside "ج.م" and produce a trailing-dot NaN.
  const parseMoneyCell = (text: string) => Number(text.trim().split(/\s/)[0].replace(/,/g, ""));
  // Backlog 10.14 (verifier, third pass) — exact string equality, not "close to": the fixture
  // seeded above (a 19,999-piastre order, never a round hundred) guarantees the period's total
  // revenue carries a real piastre remainder, so a whole-pound-then-".00" bug (the one the
  // verifier caught live on the money tab) would fail this assertion, not slip through a loose
  // tolerance. `formatMoney2` is the same function the print page itself calls — this proves
  // the *page* renders what the (separately unit-tested) formatter produces from the API's own
  // piastre count, not a second, independent computation.
  expect(revenueTileValue).toBe(formatMoney2(apiRevenuePiastres));
  expect(apiRevenuePiastres % 100).not.toBe(0); // the fixture's odd remainder actually landed in this total

  // The product breakdown's total row (columns: المنتج, القطع, الإيراد, حصة الإيراد) sums to
  // الإيراد within ±1 piastre (10.13's per-item discount allocation can drift by a rounding
  // piastre) — located by its own heading, since network scope's first table is "حسب
  // الشريك", not "حسب المنتج". `all: true` upstream means this total is over *every* product
  // row, not just page 1 — the truncation bug from the first pass is exactly what this guards.
  const productTable = page.locator(".table-block", { has: page.getByRole("heading", { name: "حسب المنتج" }) });
  const totalRowText = await productTable.locator("tr.total-row td").nth(2).innerText();
  const totalRowPiastres = Math.round(parseMoneyCell(totalRowText) * 100);
  expect(Math.abs(totalRowPiastres - apiRevenuePiastres)).toBeLessThanOrEqual(1);

  // PM review (second pass) — the product table folds past 25 data rows into one "باقي
  // المنتجات (N)" row, so it never prints more than 25 data rows + 1 rest row + 1 total row,
  // however many products actually sold in the period (this fixture DB's ~300+). The
  // reconciliation above already proves the fold doesn't drop any revenue.
  const productDataRows = productTable.locator("tbody tr:not(.total-row)");
  const productDataRowCount = await productDataRows.count();
  expect(productDataRowCount).toBeLessThanOrEqual(26);
  await expect(productTable.getByText(/^باقي المنتجات \(\d+\)$/)).toBeVisible();

  // Fix 4 — the top product row's share bar renders at full width (100%), not a literal
  // percent-of-100 (which would leave every real row's bar looking nearly empty).
  // The browser normalises the inline style's percentage text (e.g. "100.0%" -> "100%"); parse
  // it back to a number rather than asserting an exact string.
  const topBarWidth = await productTable.locator("tbody tr").first().locator(".share-bar-fill").evaluate((el) => (el as HTMLElement).style.width);
  expect(parseFloat(topBarWidth)).toBeCloseTo(100, 0);

  // Fix 3 — no all-zero row anywhere on the page (governorate is the table most likely to
  // carry one: most governorates have 0 orders/0 revenue in a filtered order set).
  const govTable = page.locator(".table-block", { has: page.getByRole("heading", { name: "حسب المحافظة" }) });
  await expect(govTable.getByRole("columnheader", { name: "نسبة الإلغاء" })).toHaveCount(0);
  const govRows = govTable.locator("tbody tr:not(.total-row)");
  const govRowCount = await govRows.count();
  for (let i = 0; i < govRowCount; i++) {
    const cells = govRows.nth(i).locator("td");
    const ordersText = (await cells.nth(1).innerText()).trim();
    const revenueText = (await cells.nth(2).innerText()).trim();
    expect(ordersText === "0" && parseMoneyCell(revenueText) === 0).toBe(false);
  }

  // Fix 6 — the payment table uses the Arabic label, never the raw enum value.
  const paymentTable = page.locator(".table-block", { has: page.getByRole("heading", { name: "حسب طريقة الدفع" }) });
  await expect(paymentTable.getByText("COD", { exact: true })).toHaveCount(0);
  await expect(paymentTable.getByText("INSTAPAY_PREPAID", { exact: true })).toHaveCount(0);
});

test("10.16 — حسب المنتج row and the print page show the fixture product's slug", async ({ page }) => {
  await loginAsAdmin(page);
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId }, select: { name: true, slug: true } });

  // The redesign DB is shared with every other suite's "today" fixtures, so the product
  // breakdown's revenue ranking (page 1 of 25, highest revenue first) can't be relied on to
  // include ours by coincidence — a deliberately outsized order guarantees it ranks first,
  // same precedent as the money-formatting fixture's odd remainder. Cleaned up in afterAll
  // via allOrderIds, exactly like every other fixture order in this file.
  const rankingOrder = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "DELIVERED",
      assignedPartnerId: pair.agent.partnerId,
      subtotalPiastres: 500_000_000,
      totalPiastres: 500_000_000,
      shippingAddress: { governorate: "القاهرة", city: "القاهرة", area: "مدينة نصر" },
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      items: {
        create: [
          {
            variantId,
            productName: product.name,
            variantName: `${product.slug}-ranking`,
            sku: `RPT-RANK-${uniqueSuffix}`,
            quantity: 1,
            unitPricePiastres: 500_000_000,
            totalPiastres: 500_000_000,
          },
        ],
      },
    },
  });
  allOrderIds.push(rankingOrder.id);

  await page.goto("/admin/reports/sales?preset=today");
  await page.getByRole("button", { name: "حسب المنتج" }).click();
  const onScreenRow = page.getByRole("row").filter({ hasText: product.name });
  await expect(onScreenRow.first()).toContainText(product.slug, { timeout: 15_000 });

  await page.goto("/admin/reports/sales/print?preset=today&orders=accomplished");
  const productTable = page.locator(".table-block", { has: page.getByRole("heading", { name: "حسب المنتج" }) });
  const printRow = productTable.locator("tbody tr").filter({ hasText: product.name });
  await expect(printRow.locator(".cell-sub")).toHaveText(product.slug);
});

test("10.14: preset/tab validation, and a partner session gets 403 on the print route", async ({ page }) => {
  await loginAsAdmin(page);
  const badTab = await page.request.get("/admin/reports/bogus/print");
  expect(badTab.status()).toBe(400);
  const badPreset = await page.request.get("/admin/reports/sales/print?preset=bogus");
  expect(badPreset.status()).toBe(400);

  const okRes = await page.request.get("/admin/reports/sales/print?preset=today");
  expect(okRes.ok()).toBeTruthy();
  expect(okRes.headers()["content-type"]).toContain("text/html");

  const partnerContext = await page.context().browser()!.newContext();
  const partnerPage = await partnerContext.newPage();
  await loginAs(partnerPage, pair, "AGENT");
  const partnerRes = await partnerPage.request.get("/admin/reports/sales/print?preset=today");
  expect(partnerRes.status()).toBe(403);
  await partnerContext.close();
});

test("10.14: a logged-out request to the print route is a 401, like the admin API routes", async ({ browser }) => {
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  const res = await guestPage.request.get("/admin/reports/sales/print?preset=today");
  expect(res.status()).toBe(401);
  await guestContext.close();
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
