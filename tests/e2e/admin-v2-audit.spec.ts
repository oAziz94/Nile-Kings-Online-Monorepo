import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Backlog 9.7 (c)/(d)/(e)/(f)/(g) coverage: `/admin/audit`'s table/filters/search/expand/CSV/
 * cursor pagination, the 9.2 "السجل كاملًا" link, in-context audit on the order timeline and
 * the partner settings tab, the partner-write mirror (`actorRole: "PARTNER"`), retention, and
 * the cancel-reason floor.
 */

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

const ADMIN_PHONE = "+201099966201";
const ADMIN_PASSWORD = "AdminAuditTest123!";
const ADMIN_NAME = "مسؤول اختبار السجل";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.describe.configure({ mode: "serial" });

let adminUserId: string;
let pair: PartnerFixturePair;
let categoryId: string;
let productId: string;
let variantId: string;
let orderId: string;
let couponId: string;
let receiptId: string;

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
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
  });
  adminUserId = admin.id;

  pair = await seedPartnerPair(prisma);

  const category = await prisma.category.create({
    data: { name: `فئة اختبار السجل ${uniqueSuffix}`, slug: `test-cat-audit-${uniqueSuffix}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج اختبار السجل ${uniqueSuffix}`, slug: `test-product-audit-${uniqueSuffix}`, weightGrams: 200 },
  });
  productId = product.id;
  const variant = await prisma.variant.create({
    data: { productId, sku: `TEST-AUDIT-${uniqueSuffix}`, name: "M", pricePiastres: 5000, stockAvailable: 0, stockReserved: 0 },
  });
  variantId = variant.id;

  // An unassigned CREATED order for the "order assign" seed action — the agent needs
  // enough PartnerInventory to cover it (assignOrderToPartner checks stock).
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId, stockAvailable: 50, stockReserved: 0 },
  });
  const customer = await prisma.user.upsert({
    where: { phone: "+201099966202" },
    create: { phone: "+201099966202", role: "CUSTOMER", passwordHash: await hashPassword("AuditCust123!") },
    update: {},
  });
  const order = await prisma.order.create({
    data: {
      userId: customer.id,
      status: "CREATED",
      subtotalPiastres: 5000,
      totalPiastres: 5000,
      shippingAddress: {
        governorate: "القاهرة",
        city: "مدينة نصر",
        area: "الحي الثامن",
        street: "شارع اختبار السجل",
        phone: "+201000000556",
      },
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      items: {
        create: [
          {
            variantId,
            productName: product.name,
            variantName: `اختبار-${uniqueSuffix}`,
            sku: variant.sku,
            quantity: 1,
            unitPricePiastres: 5000,
            totalPiastres: 5000,
          },
        ],
      },
    },
  });
  orderId = order.id;
});

test.afterAll(async () => {
  await prisma.adminAuditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: { in: [adminUserId, pair.agent.userId] } },
        { entityId: { in: [orderId, couponId, pair.agent.partnerId, receiptId].filter(Boolean) as string[] } },
      ],
    },
  });
  if (couponId) await prisma.coupon.deleteMany({ where: { id: couponId } });
  await prisma.orderItem.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
  await prisma.user.deleteMany({ where: { phone: "+201099966202" } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.variant.deleteMany({ where: { id: variantId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { id: adminUserId } });
  await prisma.$disconnect();
});

test("seed actions through the APIs, then the list/filters/search/expand/link/CSV/pagination all work", async ({ page }) => {
  // Verifier fix (9.7 review): this test failed at 28s of 30 on a cold server (first hit of
  // /admin/audit + its API route pays Turbopack's compile cost) — same headroom 8.1 added.
  test.setTimeout(60_000);
  await loginAsAdmin(page);

  // 1. coupon create
  const couponRes = await page.request.post("/api/admin/coupons", {
    data: { code: `AUDIT-${uniqueSuffix}`, discountType: "PERCENT", discountValue: 10, active: true },
  });
  expect(couponRes.ok()).toBeTruthy();
  couponId = (await couponRes.json()).data.id;

  // 2. partner PATCH (costRateBps change)
  const patchRes = await page.request.patch(`/api/admin/partners/${pair.agent.partnerId}`, {
    data: { costRateBps: 7000 },
  });
  expect(patchRes.ok()).toBeTruthy();

  // 3. order assign
  const assignRes = await page.request.post(`/api/admin/orders/${orderId}/assign`, {
    data: { partnerId: pair.agent.partnerId },
  });
  expect(assignRes.ok()).toBeTruthy();

  // 4. a partner-side receipt (mirrors into AdminAuditLog with actorRole PARTNER)
  await page.context().clearCookies();
  await loginAs(page, pair, "AGENT");
  const receiptRes = await page.request.post("/api/partner/receipts", {
    data: { kind: "FACTORY", lines: [{ variantId, quantity: 5 }] },
  });
  expect(receiptRes.ok()).toBeTruthy();
  receiptId = (await receiptRes.json()).data.id;

  // 5. a partner order status change (CONFIRMED -> PROCESSING, the generic transition branch)
  await prisma.order.update({ where: { id: orderId }, data: { status: "CONFIRMED" } });
  const statusRes = await page.request.patch(`/api/partner/orders/${orderId}`, {
    data: { status: "PROCESSING" },
  });
  expect(statusRes.ok()).toBeTruthy();

  await page.context().clearCookies();
  await loginAsAdmin(page);

  // Mirrored partner rows exist with actorRole PARTNER.
  const mirroredRows = await prisma.adminAuditLog.findMany({
    where: { actorUserId: pair.agent.userId },
    orderBy: { createdAt: "desc" },
  });
  expect(mirroredRows.some((r) => r.entityType === "receipt" && r.actorRole === "PARTNER")).toBe(true);
  expect(mirroredRows.some((r) => r.entityType === "order" && r.action === "status_change" && r.actorRole === "PARTNER")).toBe(true);

  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "السجل" })).toBeVisible();

  // Newest first, with actor + role visible.
  const rows = page.getByTestId("audit-rows").locator("> div");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });

  // Search by order number finds the assign row.
  await page.getByPlaceholder("رقم طلب أو شريك أو SKU أو اسم").fill(orderId.slice(-8));
  await expect(page.getByText("أسند الطلب")).toBeVisible({ timeout: 10_000 });
  await page.getByPlaceholder("رقم طلب أو شريك أو SKU أو اسم").fill("");

  // Filter by actor = الشركاء (the group entry) narrows to PARTNER rows only.
  const actorFilter = page.getByLabel("الفاعل");
  await actorFilter.selectOption("group:PARTNER");
  await expect(page.getByTestId("audit-rows").getByText("شريك", { exact: true }).first()).toBeVisible({ timeout: 10_000 });

  // PM ruling (9.7 review): the actor filter is per-admin, not just a role toggle — selecting
  // the seeded admin by name narrows to rows actually written by that admin (the coupon
  // create above), and excludes the PARTNER-mirrored rows this same test just asserted are
  // visible under the group filter.
  await actorFilter.selectOption({ label: ADMIN_NAME });
  await expect(page.getByTestId("audit-rows").getByText("أنشأ الكوبون")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("audit-rows").getByText("أنشأ الإيصال")).toHaveCount(0);
  await actorFilter.selectOption("");

  // Expand a row -> sentence + before/after; "على" opens the entity. (The audit-rows
  // container's first `> div` is the desktop column-header row, which has no button — this
  // targets the first actual row's toggle button directly.)
  const firstRowButton = page.getByTestId("audit-rows").locator("button").first();
  await firstRowButton.click();
  await expect(page.getByText("فتح ←")).toBeVisible();

  // CSV export 200.
  const csvRes = await page.request.get("/api/admin/audit?format=csv&limit=5");
  expect(csvRes.ok()).toBeTruthy();
  expect(csvRes.headers()["content-type"]).toContain("text/csv");

  // Cursor pagination without overlap.
  const page1 = await page.request.get("/api/admin/audit?limit=2");
  const page1Json = await page1.json();
  expect(page1Json.data.items.length).toBe(2);
  const cursor = page1Json.data.nextCursor;
  if (cursor) {
    const page2 = await page.request.get(`/api/admin/audit?limit=2&cursor=${cursor}`);
    const page2Json = await page2.json();
    const ids1 = new Set(page1Json.data.items.map((r: { id: string }) => r.id));
    for (const row of page2Json.data.items as { id: string }[]) {
      expect(ids1.has(row.id)).toBe(false);
    }
  }
});

const SCREENSHOT_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1514, height: 681 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

test("screenshots: /admin/audit at the four viewports", async ({ page }) => {
  await loginAsAdmin(page);
  for (const { width, height } of SCREENSHOT_VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto("/admin/audit");
    await expect(page.getByRole("heading", { name: "السجل" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("جاري التحميل…")).toBeHidden({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/admin-v2-audit-${width}x${height}.png`, fullPage: true });
  }
});

test("the 9.2 'السجل كاملًا' link opens /admin/audit", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin");
  await page.getByRole("link", { name: "السجل كاملًا" }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/);
});

test("the order timeline shows the assign row with the actor named", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByText(/أسند الطلب/)).toBeVisible({ timeout: 15_000 });
});

test("the partner profile shows the settings change under the settings tab", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/partners/${pair.agent.partnerId}?tab=settings`);
  await expect(page.getByText("من غيّر إعدادات هذا الشريك")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/نسبة الشراء/).first()).toBeVisible({ timeout: 15_000 });
});

test("retention: rows dated 401 days ago are pruned unless money/stock", async ({ page }) => {
  expect(CRON_SECRET, "CRON_SECRET must be set in this worktree's .env.redesign").toBeTruthy();
  const oldDate = new Date(Date.now() - 401 * 24 * 60 * 60 * 1000);

  const oldCoupon = await prisma.adminAuditLog.create({
    data: {
      actorUserId: adminUserId,
      actorRole: "ADMIN",
      action: "create",
      entityType: "coupon",
      entityId: `retention-coupon-${uniqueSuffix}`,
      createdAt: oldDate,
    },
  });
  const oldReceipt = await prisma.adminAuditLog.create({
    data: {
      actorUserId: adminUserId,
      actorRole: "ADMIN",
      action: "create",
      entityType: "receipt",
      entityId: `retention-receipt-${uniqueSuffix}`,
      createdAt: oldDate,
    },
  });

  const res = await page.request.get("/api/cron/stock-snapshot", { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  expect(res.ok()).toBeTruthy();

  const couponRow = await prisma.adminAuditLog.findUnique({ where: { id: oldCoupon.id } });
  const receiptRow = await prisma.adminAuditLog.findUnique({ where: { id: oldReceipt.id } });
  expect(couponRow).toBeNull();
  expect(receiptRow).toBeTruthy();

  await prisma.adminAuditLog.deleteMany({ where: { id: oldReceipt.id } });
});

test("the cancel-reason floor: PATCH to CANCELLED with a short/missing reason is 400", async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.patch(`/api/admin/orders/${orderId}`, {
    data: { status: "CANCELLED", cancellationReason: "x" },
  });
  expect(res.status()).toBe(400);
  const json = await res.json();
  expect(json.error.message).toBe("سبب الإلغاء مطلوب");
});
