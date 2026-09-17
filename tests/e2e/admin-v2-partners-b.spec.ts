import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 9.4b (الشركاء hub: الأداء tab, المسؤولون as a tab of العملاء, redirects) coverage.
 * Serial mode, one shared fixture set: admin + agent + linked distributor + one delivered
 * order for the agent (so the sales report headline is a real, comparable number) + two
 * seeded ADMIN users (for المسؤولون).
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

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

const ADMIN_PHONE = "+201099966401";
const ADMIN_PASSWORD = "AdminPartnersBTest123!";
const ADMIN_NAME = `مسؤول اختبار الأداء ${uniqueSuffix}`;
const CUSTOMER_PHONE = "+201099966402";

const SEED_ADMIN_A_PHONE = "+201099966403";
const SEED_ADMIN_A_PASSWORD = "PartnersBAdminA123!";
const SEED_ADMIN_B_PHONE = "+201099966404";
const SEED_ADMIN_B_PASSWORD = "PartnersBAdminB123!";

let adminUserId: string;
let customerUserId: string;
let seededAdminAId: string;
let seededAdminBId: string;
let pair: PartnerFixturePair;

let categoryId: string;
let productId: string;
let variantId: string;
let deliveredOrderId: string;
const allOrderIds: string[] = [];

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
    create: { phone: CUSTOMER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword("PartnersBCust123!"), name: `عميل الأداء ${uniqueSuffix}` },
    update: {},
  });
  customerUserId = customer.id;

  const seededAdminA = await prisma.user.upsert({
    where: { phone: SEED_ADMIN_A_PHONE },
    create: { phone: SEED_ADMIN_A_PHONE, role: "ADMIN", passwordHash: await hashPassword(SEED_ADMIN_A_PASSWORD), name: `مسؤول أ ${uniqueSuffix}` },
    update: { passwordHash: await hashPassword(SEED_ADMIN_A_PASSWORD), role: "ADMIN" },
  });
  seededAdminAId = seededAdminA.id;
  const seededAdminB = await prisma.user.upsert({
    where: { phone: SEED_ADMIN_B_PHONE },
    create: { phone: SEED_ADMIN_B_PHONE, role: "ADMIN", passwordHash: await hashPassword(SEED_ADMIN_B_PASSWORD), name: `مسؤول ب ${uniqueSuffix}` },
    update: { passwordHash: await hashPassword(SEED_ADMIN_B_PASSWORD), role: "ADMIN" },
  });
  seededAdminBId = seededAdminB.id;

  pair = await seedPartnerPair(prisma);

  const category = await prisma.category.create({
    data: { name: `فئة أداء ${uniqueSuffix}`, slug: `perf-cat-${uniqueSuffix}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج أداء ${uniqueSuffix}`, slug: `perf-product-${uniqueSuffix}`, active: true, weightGrams: 300 },
  });
  productId = product.id;
  const variant = await prisma.variant.create({
    data: { productId, sku: `PB-${uniqueSuffix}`, name: "M", colorName: "أحمر", pricePiastres: 15000 },
  });
  variantId = variant.id;

  // One DELIVERED order inside the default 30d window, so the sales headline's revenue/units
  // are real, comparable-across-sessions numbers rather than all zero.
  const order = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "DELIVERED",
      assignedPartnerId: pair.agent.partnerId,
      subtotalPiastres: 15000,
      totalPiastres: 15000,
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
            unitPricePiastres: 15000,
            totalPiastres: 15000,
          },
        ],
      },
    },
  });
  deliveredOrderId = order.id;
  allOrderIds.push(order.id);
});

test.afterAll(async () => {
  await prisma.orderAuditLog.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: allOrderIds } } });
  await prisma.variant.deleteMany({ where: safeWhere({ id: variantId }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await cleanupPartnerPair(prisma, pair);
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, customerUserId, seededAdminAId, seededAdminBId] } } });
  await prisma.$disconnect();
});

test("admin reads the seeded partner's sales report with the same headline numbers the partner sees, for the same period", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const adminRes = await page.request.get(`/api/admin/partners/${pair.agent.partnerId}/reports/sales?preset=30d`);
  expect(adminRes.ok()).toBeTruthy();
  const adminJson = await adminRes.json();

  const partnerContext = await browser.newContext();
  const partnerPage = await partnerContext.newPage();
  await partnerPage.goto("/login");
  await partnerPage.getByLabel("رقم الهاتف").fill(pair.agent.localPhone);
  await partnerPage.getByLabel("كلمة المرور").fill(pair.password);
  await partnerPage.getByRole("button", { name: "تسجيل الدخول" }).click();
  await partnerPage.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  const partnerRes = await partnerPage.request.get("/api/partner/reports/sales?preset=30d");
  expect(partnerRes.ok()).toBeTruthy();
  const partnerJson = await partnerRes.json();
  await partnerContext.close();

  expect(adminJson.data.headline).toEqual(partnerJson.data.headline);
  expect(adminJson.data.comparisonLabel).toEqual(partnerJson.data.comparisonLabel);
  // Sanity that the fixture order is actually inside this headline, not two zero-revenue
  // reports agreeing vacuously.
  const revenue = adminJson.data.headline.find((h: { key: string }) => h.key === "revenue");
  expect(revenue?.value).toBeGreaterThanOrEqual(15000);
});

test("CSV export 200 from the admin route", async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.get(`/api/admin/partners/${pair.agent.partnerId}/reports/sales?preset=30d&format=csv&breakdown=product`);
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-type"]).toContain("text/csv");
});

test("network report 400 for a distributor's admin route; 200 for the agent", async ({ page }) => {
  await loginAsAdmin(page);
  const distributorRes = await page.request.get(`/api/admin/partners/${pair.distributor.partnerId}/reports/network?preset=30d`);
  expect(distributorRes.status()).toBe(400);

  const agentRes = await page.request.get(`/api/admin/partners/${pair.agent.partnerId}/reports/network?preset=30d`);
  expect(agentRes.ok()).toBeTruthy();
});

test("404 for a non-existent partner id; 401 signed-out; 403 for a customer", async ({ page, browser }) => {
  await loginAsAdmin(page);
  const notFoundRes = await page.request.get("/api/admin/partners/does-not-exist/reports/sales");
  expect(notFoundRes.status()).toBe(404);

  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  const guestRes = await guestPage.request.get(`/api/admin/partners/${pair.agent.partnerId}/reports/sales`);
  expect(guestRes.status()).toBe(401);
  await guestContext.close();

  // A fresh context, not the already-authenticated admin `page` — logged-in users are
  // auto-redirected off `/login`.
  const customerContext = await browser.newContext();
  const customerPage = await customerContext.newPage();
  await customerPage.goto("/login");
  await customerPage.getByLabel("رقم الهاتف").fill(CUSTOMER_PHONE.replace("+20", ""));
  await customerPage.getByLabel("كلمة المرور").fill("PartnersBCust123!");
  await customerPage.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(customerPage).toHaveURL("/", { timeout: 20_000 });
  const customerRes = await customerPage.request.get(`/api/admin/partners/${pair.agent.partnerId}/reports/sales`);
  expect(customerRes.status()).toBe(403);
  await customerContext.close();
});

test("الأداء tab renders the sales report and switches families without navigating", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/partners/${pair.agent.partnerId}?tab=performance`);
  await expect(page.getByRole("heading", { name: "تقرير المبيعات" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(deliveredOrderId.slice(0, 8))).toHaveCount(0); // sanity: not the orders tab

  await page.getByRole("button", { name: "التجهيز" }).click();
  await expect(page.getByRole("heading", { name: "تقرير التجهيز" })).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(`/admin/partners/${pair.agent.partnerId}?tab=performance`);

  await page.getByRole("button", { name: "الشبكة" }).click();
  await expect(page.getByRole("heading", { name: "تقرير الشبكة" })).toBeVisible({ timeout: 20_000 });
});

test("الأداء tab drops الشبكة for a distributor", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/partners/${pair.distributor.partnerId}?tab=performance`);
  await expect(page.getByRole("heading", { name: "تقرير المبيعات" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "الشبكة" })).toHaveCount(0);
});

test("المسؤولون tab on /admin/clients shows the seeded admins; revoke still refuses self", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/clients?tab=admins");
  await expect(page.getByRole("tab", { name: "المسؤولون" })).toHaveAttribute("aria-selected", "true");

  const rowA = page.getByRole("row").filter({ hasText: SEED_ADMIN_A_PHONE });
  await expect(rowA).toBeVisible({ timeout: 20_000 });
  const rowSelf = page.getByRole("row").filter({ hasText: ADMIN_PHONE });
  await expect(rowSelf).toBeVisible();
  await expect(rowSelf.getByRole("button", { name: "إزالة الصلاحية" })).toBeDisabled();

  // Revoking someone else still works from the tab.
  await rowA.getByRole("button", { name: "إزالة الصلاحية" }).click();
  await page.getByRole("button", { name: "تأكيد الإزالة" }).click();
  await expect(page.getByText("تمت إزالة صلاحية المسؤول").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("row").filter({ hasText: SEED_ADMIN_A_PHONE })).toHaveCount(0);

  // Restore the fixture's role for a clean afterAll (deleting the user works regardless of role,
  // but keep the fixture data honest in case of a retry).
  await prisma.user.update({ where: { id: seededAdminAId }, data: { role: "ADMIN" } });
});

test("/admin/admins redirects permanently to /admin/clients?tab=admins", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/admins");
  await expect(page).toHaveURL("/admin/clients?tab=admins", { timeout: 20_000 });
});

const SCREENSHOT_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1514, height: 681 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

test("screenshots: الأداء and المسؤولون at the four viewports", async ({ page }) => {
  await loginAsAdmin(page);
  for (const { width, height } of SCREENSHOT_VIEWPORTS) {
    await page.setViewportSize({ width, height });

    await page.goto(`/admin/partners/${pair.agent.partnerId}?tab=performance`);
    await expect(page.getByRole("heading", { name: "تقرير المبيعات" })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/admin-v2-performance-${width}x${height}.png`, fullPage: true });

    await page.goto("/admin/clients?tab=admins");
    await expect(page.getByRole("heading", { name: "المسؤولون" })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/admin-v2-admins-${width}x${height}.png`, fullPage: true });

    if (width === 390) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
      expect(overflow).toBe(true);
    }
  }
});
