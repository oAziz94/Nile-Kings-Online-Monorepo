import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { seedPartnerPair, loginAs, cleanupPartnerPair, hashPassword, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 5.6b (Partner portal v2 — Fulfilment + Network + Money reports) e2e coverage.
 * Serial mode: one seeded fixture pair, orders + `OrderAuditLog` rows placed at precise
 * offsets for the timing assertions, one FACTORY `StockReceipt` + admin-recorded payments for
 * the Money assertions.
 */
test.describe.configure({ mode: "serial" });
// Backlog 9.0d: a cold Turbopack server's first compile can push a save/PATCH well past
// Playwright's 30s default; 60s is this suite's floor.
test.setTimeout(60_000);

const prisma = new PrismaClient();
let pair: PartnerFixturePair;

const RUN_TAG = `e2e-5-6b-${Date.now()}`;
const ADMIN_PHONE = `+2010${String(Date.now()).slice(-8)}`;
const ADMIN_PASSWORD = "AdminTest123!";
let adminUserId: string;

let categoryId: string;
let productId: string;
let variantId: string;
let customerUserId: string;
const orderIds: string[] = [];
let receiptId: string;

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(12, 0, 0, 0);
  return d;
}

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma, { agent: { costRateBps: 7500, confirmSlaHours: 48, shipSlaHours: 24 } });

  const adminUser = await prisma.user.create({
    data: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD) },
  });
  adminUserId = adminUser.id;

  const category = await prisma.category.create({ data: { name: `فئة 5.6b ${RUN_TAG}`, slug: `cat-5-6b-${RUN_TAG}` } });
  categoryId = category.id;
  const product = await prisma.product.create({ data: { categoryId, name: `منتج 5.6b ${RUN_TAG}`, slug: `p-5-6b-${RUN_TAG}`, active: true } });
  productId = product.id;
  const variant = await prisma.variant.create({
    data: { productId, sku: `SKU-5-6B-${RUN_TAG}`, name: "M", pricePiastres: 10000 },
  });
  variantId = variant.id;

  const customer = await prisma.user.create({ data: { phone: `+2011${String(Date.now()).slice(-8)}`, role: "CUSTOMER" } });
  customerUserId = customer.id;

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

  // --- Fulfilment timing seed: order created 20h ago, confirmed 15h ago (5h to confirm),
  // shipped 3h ago (12h from confirm to ship). Status SHIPPED (open funnel, not overdue: the
  // "ship" timing only measures the confirmed->shipped duration, unrelated to the overdue
  // rule which only looks at currently-open CONFIRMED/PROCESSING orders).
  const order1 = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "SHIPPED",
      subtotalPiastres: 10000,
      totalPiastres: 10000,
      shippingAddress: baseAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      assignedPartnerId: pair.agent.partnerId,
      createdAt: hoursAgo(20),
      items: { create: [{ variantId, productName: "p", variantName: "M", sku: `SKU-5-6B-${RUN_TAG}`, quantity: 1, unitPricePiastres: 10000, totalPiastres: 10000 }] },
    },
  });
  orderIds.push(order1.id);
  await prisma.orderAuditLog.createMany({
    data: [
      { orderId: order1.id, event: "confirmed", statusFrom: "CREATED", statusTo: "CONFIRMED", createdAt: hoursAgo(15) },
      { orderId: order1.id, event: "status_change", statusFrom: "PROCESSING", statusTo: "SHIPPED", createdAt: hoursAgo(3) },
    ],
  });

  // --- Overdue seed: a CONFIRMED order that entered CONFIRMED 30h ago (> 24h shipSlaHours) -> overdue.
  const order2 = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "CONFIRMED",
      subtotalPiastres: 5000,
      totalPiastres: 5000,
      shippingAddress: baseAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      assignedPartnerId: pair.agent.partnerId,
      createdAt: hoursAgo(40),
      items: { create: [{ variantId, productName: "p", variantName: "M", sku: `SKU-5-6B-${RUN_TAG}`, quantity: 1, unitPricePiastres: 5000, totalPiastres: 5000 }] },
    },
  });
  orderIds.push(order2.id);
  await prisma.orderAuditLog.create({
    data: { orderId: order2.id, event: "confirmed", statusFrom: "CREATED", statusTo: "CONFIRMED", createdAt: hoursAgo(30) },
  });

  // --- A DELIVERED order for the Money report's "collected in period" side.
  const order3 = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "DELIVERED",
      subtotalPiastres: 20000,
      totalPiastres: 20000,
      shippingAddress: baseAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      assignedPartnerId: pair.agent.partnerId,
      createdAt: hoursAgo(10),
      items: { create: [{ variantId, productName: "p", variantName: "M", sku: `SKU-5-6B-${RUN_TAG}`, quantity: 2, unitPricePiastres: 10000, totalPiastres: 20000 }] },
    },
  });
  orderIds.push(order3.id);

  // --- Money seed: a FACTORY receipt at the partner's current rate (7500 bps), then the
  // rate is changed afterward — the receipt's own totalCostPiastres must not move.
  const receipt = await prisma.stockReceipt.create({
    data: {
      partnerId: pair.agent.partnerId,
      kind: "FACTORY",
      reference: `FR-${RUN_TAG}`,
      totalCostPiastres: 75000, // 100 units * 1000 piastres * 75%
      lines: {
        create: [{ variantId, quantity: 100, previousAvailable: 0, newAvailable: 100, unitCostPiastres: 750 }],
      },
    },
  });
  receiptId = receipt.id;

  // --- Network report seed (backlog 7.4): DELIVERED orders assigned to the linked
  // DISTRIBUTOR, one in the current 30d window and one in the previous 30d window, for the
  // distributor breakdown's own previous-period sales delta.
  const order4 = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "DELIVERED",
      subtotalPiastres: 40000,
      totalPiastres: 40000,
      shippingAddress: baseAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      assignedPartnerId: pair.distributor.partnerId,
      createdAt: daysAgo(5),
      items: { create: [{ variantId, productName: "p", variantName: "M", sku: `SKU-5-6B-${RUN_TAG}`, quantity: 4, unitPricePiastres: 10000, totalPiastres: 40000 }] },
    },
  });
  orderIds.push(order4.id);
  const order5 = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "DELIVERED",
      subtotalPiastres: 10000,
      totalPiastres: 10000,
      shippingAddress: baseAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      assignedPartnerId: pair.distributor.partnerId,
      createdAt: daysAgo(40),
      items: { create: [{ variantId, productName: "p", variantName: "M", sku: `SKU-5-6B-${RUN_TAG}`, quantity: 1, unitPricePiastres: 10000, totalPiastres: 10000 }] },
    },
  });
  orderIds.push(order5.id);
});

test.afterAll(async () => {
  await prisma.orderAuditLog.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.partnerPayment.deleteMany({ where: safeWhere({ partnerId: pair.agent.partnerId }) });
  await prisma.stockReceiptLine.deleteMany({ where: safeWhere({ receiptId }) });
  await prisma.stockReceipt.deleteMany({ where: safeWhere({ id: receiptId }) });
  await prisma.variant.deleteMany({ where: safeWhere({ productId }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
  await prisma.category.delete({ where: safeWhere({ id: categoryId }) });
  await prisma.user.deleteMany({ where: safeWhere({ id: customerUserId }) });
  await cleanupPartnerPair(prisma, pair);
  await prisma.user.delete({ where: safeWhere({ id: adminUserId }) });
  await prisma.$disconnect();
});

test("fulfilment report: timings equal the seeded audit rows", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  const res = await page.request.get("/api/partner/reports/fulfilment?preset=30d", { headers: { accept: "application/json" } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  const headline: { key: string; value: number }[] = json.data.headline;
  const byKey = Object.fromEntries(headline.map((h) => [h.key, h]));

  // order1: createdAt -20h, confirmed -15h -> 5h to confirm. order2: createdAt -40h,
  // confirmed -30h -> 10h to confirm. Median of [5, 10] = 7.5.
  expect(byKey.medianHoursToConfirm.value).toBeCloseTo(7.5, 1);
  expect(byKey.medianHoursToShip.value).toBeCloseTo(12, 1); // order1 only: confirmed -15h, shipped -3h

  // order2 is CONFIRMED, entered 30h ago > 24h shipSlaHours -> the only open order, so
  // overdueRate over open (CONFIRMED/PROCESSING) orders = 100%.
  expect(byKey.overdueRate.value).toBeCloseTo(100, 1);

  const slowest = json.data.breakdowns.slowest.rows as { orderId: string }[];
  expect(slowest.some((r) => r.orderId === orderIds[0])).toBe(true);
});

test("fulfilment report UI renders at /partner/reports/fulfilment", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/reports/fulfilment");
  await expect(page.getByRole("heading", { name: "تقرير التجهيز" })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".nk-shimmer")).toHaveCount(0, { timeout: 20_000 });
});

test("money report: the balance equals receipts minus payments after admin records a down payment and an installment", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

  const downPaymentRes = await page.request.post(`/api/admin/partners/${pair.agent.partnerId}/payments`, {
    data: { kind: "DOWN_PAYMENT", amountPiastres: 20000, paidAt: new Date().toISOString(), stockReceiptId: receiptId, reference: `DP-${RUN_TAG}` },
  });
  expect(downPaymentRes.ok()).toBeTruthy();

  const installmentRes = await page.request.post(`/api/admin/partners/${pair.agent.partnerId}/payments`, {
    data: { kind: "INSTALLMENT", amountPiastres: 15000, paidAt: new Date().toISOString(), reference: `INST-${RUN_TAG}` },
  });
  expect(installmentRes.ok()).toBeTruthy();

  // Rate change after the receipt: must not touch the receipt's own totalCostPiastres.
  await prisma.partner.update({ where: { id: pair.agent.partnerId }, data: { costRateBps: 7200 } });

  await page.context().clearCookies();
  await loginAs(page, pair, "AGENT");
  const res = await page.request.get("/api/partner/reports/money?preset=allTime", { headers: { accept: "application/json" } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  const byKey = Object.fromEntries((json.data.headline as { key: string; value: number }[]).map((h) => [h.key, h]));

  // Receipt total unchanged by the rate change (still 75000, not recomputed at 7200 bps).
  expect(byKey.receivedAllTime.value).toBe(75000);
  expect(byKey.paidAllTime.value).toBe(20000 + 15000);
  expect(byKey.balance.value).toBe(75000 - 35000);

  const receiptRow = (json.data.breakdowns.receipts.rows as { id: string; totalCostPiastres: number }[]).find((r) => r.id === receiptId);
  expect(receiptRow?.totalCostPiastres).toBe(75000);

  await prisma.partner.update({ where: { id: pair.agent.partnerId }, data: { costRateBps: 7500 } });
});

test("money report UI renders at /partner/reports/money", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/reports/money");
  await expect(page.getByRole("heading", { name: "المال" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("حسابك مع المصنع")).toBeVisible();
  await expect(page.getByText("نقدك من العملاء")).toBeVisible();
});

test("network report: the AGENT sees the roster, the DISTRIBUTOR sees the explicit role panel", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  const agentRes = await page.request.get("/api/partner/reports/network?preset=30d", { headers: { accept: "application/json" } });
  expect(agentRes.ok()).toBeTruthy();
  const agentJson = await agentRes.json();

  // Distributor breakdown delta (backlog 7.4): 40,000 now vs. 10,000 previously -> +30,000, +300%.
  const distRow = agentJson.data.breakdowns.distributor.rows.find(
    (r: { partnerId: string }) => r.partnerId === pair.distributor.partnerId
  );
  expect(distRow).toBeTruthy();
  expect(distRow.salesPiastres).toBe(40000);
  expect(distRow.previousSalesPiastres).toBe(10000);
  expect(distRow.salesDelta.direction).toBe("up");
  expect(distRow.salesDelta.changeAbs).toBe(30000);
  expect(distRow.salesDelta.changePct).toBe(300);

  await page.context().clearCookies();
  await loginAs(page, pair, "DISTRIBUTOR");
  const distributorRes = await page.request.get("/api/partner/reports/network?preset=30d", { headers: { accept: "application/json" } });
  expect(distributorRes.status()).toBe(403);

  await page.goto("/partner/reports/network");
  await expect(page.getByText("هذه الصفحة متاحة للوكلاء فقط")).toBeVisible({ timeout: 15_000 });

  // Same +300% delta rendered by the distributor table's own "مقارنة بالفترة السابقة" column.
  await page.context().clearCookies();
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/reports/network");
  const distRowLocator = page.locator("tr", { hasText: pair.distributor.name }).first();
  await expect(distRowLocator).toBeVisible({ timeout: 15_000 });
  await expect(distRowLocator.getByText("+300%", { exact: true })).toBeVisible();
});

// Design-review screenshots (standing rule 16). Not an assertion of pixel-parity.
const VIEWPORTS: { name: string; width: number; height: number }[] = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1514x681", width: 1514, height: 681 },
  { name: "1366x768", width: 1366, height: 768 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "390x844", width: 390, height: 844 },
];

test("screenshots: fulfilment, network and money reports at every required viewport", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  const routes: { path: string; heading: string }[] = [
    { path: "fulfilment", heading: "تقرير التجهيز" },
    { path: "network", heading: "تقرير الشبكة" },
    { path: "money", heading: "المال" },
  ];
  for (const route of routes) {
    await page.goto(`/partner/reports/${route.path}`);
    await expect(page.getByRole("heading", { name: route.heading })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".nk-shimmer")).toHaveCount(0, { timeout: 20_000 });
    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(300);
      await page.screenshot({ path: `screenshots/partner-reports-${route.path}-${vp.name}.png`, fullPage: true });
    }
  }
});
