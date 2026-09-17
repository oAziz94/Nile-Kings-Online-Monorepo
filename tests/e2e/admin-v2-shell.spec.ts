import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 9.1 (admin shell on the shared dashboard shell + nav + AdminAuditLog foundation)
 * coverage: nav order/hrefs, the ticket badge matching the counts API, the mobile drawer's
 * open/close + focus return, identity from `/api/auth/me`, and the coupon audit round-trip.
 * Same seeded-fixture-user pattern as `account-v2-admin-tickets.spec.ts`.
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

const ADMIN_PHONE = "+201099966001";
const ADMIN_PASSWORD = "AdminShellTest123!";
const ADMIN_NAME = "مسؤول اختبار الواجهة";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.describe.configure({ mode: "serial" });
// Backlog 9.0d: a cold Turbopack server's first compile can push a save/PATCH well past
// Playwright's 30s default; 60s is this suite's floor.
test.setTimeout(60_000);

let adminUserId: string;
let customerUserId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let orderId: string;
let ticketId: string;
let couponId: string;

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

  const customerPhone = "+201099966002";
  const customer = await prisma.user.upsert({
    where: { phone: customerPhone },
    create: { phone: customerPhone, role: "CUSTOMER", passwordHash: await hashPassword("AdminShellCust123!") },
    update: { passwordHash: await hashPassword("AdminShellCust123!"), role: "CUSTOMER" },
  });
  customerUserId = customer.id;

  const category = await prisma.category.create({
    data: { name: `فئة اختبار واجهة الإدارة ${uniqueSuffix}`, slug: `test-cat-admin-shell-${uniqueSuffix}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج اختبار واجهة الإدارة ${uniqueSuffix}`, slug: `test-product-admin-shell-${uniqueSuffix}`, weightGrams: 200 },
  });
  productId = product.id;
  const variant = await prisma.variant.create({
    data: { productId, sku: `TEST-ADM-SHL-${uniqueSuffix}`, name: "M", pricePiastres: 5000 },
  });
  variantId = variant.id;

  const order = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "DELIVERED",
      subtotalPiastres: 5000,
      totalPiastres: 5000,
      shippingAddress: {
        governorate: "القاهرة",
        city: "مدينة نصر",
        area: "الحي الثامن",
        street: "شارع اختبار واجهة الإدارة",
        phone: "+201000000555",
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

  const ticket = await prisma.orderTicket.create({
    data: {
      orderId,
      userId: customerUserId,
      subject: "DELIVERY_DELAY",
      contactPhone: customerPhone,
      status: "OPEN",
      messages: { create: [{ authorRole: "CUSTOMER", authorUserId: customerUserId, body: "أين طلبي؟" }] },
    },
  });
  ticketId = ticket.id;
});

test.afterAll(async () => {
  if (couponId) {
    await prisma.adminAuditLog.deleteMany({ where: safeWhere({ entityId: couponId }) });
    await prisma.coupon.deleteMany({ where: safeWhere({ id: couponId }) });
  }
  await prisma.orderTicketMessage.deleteMany({ where: safeWhere({ ticketId }) });
  await prisma.orderTicket.deleteMany({ where: safeWhere({ id: ticketId }) });
  await prisma.orderItem.deleteMany({ where: safeWhere({ orderId }) });
  await prisma.order.deleteMany({ where: safeWhere({ id: orderId }) });
  await prisma.variant.deleteMany({ where: safeWhere({ id: variantId }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, customerUserId] } } });
  await prisma.$disconnect();
});

test("desktop nav shows the canvas's sections/order/hrefs, and the ticket badge equals the counts API", async ({ page }) => {
  await loginAsAdmin(page);

  const nav = page.getByRole("navigation", { name: "التنقل في لوحة الإدارة" });
  const expected: [string, string][] = [
    ["اليوم", "/admin"],
    ["الطلبات", "/admin/orders"],
    ["أسئلة العملاء", "/admin/order-tickets"],
    ["الشركاء", "/admin/partners"],
    ["المنتجات", "/admin/products"],
    ["الفئات", "/admin/categories"],
    ["الكوبونات", "/admin/coupons"],
    ["العملاء", "/admin/clients"],
    ["التقارير", "/admin/reports/sales"],
    ["الإعدادات", "/admin/settings"],
  ];
  for (const [label, href] of expected) {
    // "أسئلة العملاء" alone gets a non-exact match — it carries the badge's aria-label into
    // its own accessible name (the badge is inside the link, no separate labelledby), same
    // pattern `account-v2-admin-tickets.spec.ts` already uses for this exact item.
    const exact = label !== "أسئلة العملاء";
    await expect(nav.getByRole("link", { name: label, exact })).toHaveAttribute("href", href);
  }

  // Account block: المتجر + تسجيل الخروج, no duplicate settings link.
  // Backlog 9.0b (i): المتجر is a real `Link` to "/" with an accessible name (not a bare span).
  const storeLink = nav.getByRole("link", { name: "المتجر" });
  await expect(storeLink).toBeVisible();
  await expect(storeLink).toHaveAttribute("href", "/");
  await expect(storeLink).toHaveAttribute("aria-label", "المتجر");
  // …and it keeps that name once the sidebar collapses to icons (9.10 verifier's required fix).
  await page.getByRole("button", { name: "طيّ القائمة" }).click();
  const expandButton = page.getByRole("button", { name: "فتح القائمة" });
  await expect(expandButton).toBeVisible();
  const collapsedStoreLink = nav.getByRole("link", { name: "المتجر" });
  await expect(collapsedStoreLink).toBeVisible();
  await expect(collapsedStoreLink).toHaveAttribute("href", "/");
  await expandButton.click();
  await expect(page.getByRole("button", { name: "طيّ القائمة" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "تسجيل الخروج" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "الإعدادات", exact: true })).toHaveCount(1);

  const countsRes = await page.request.get("/api/admin/order-tickets/counts");
  const counts = await countsRes.json();
  const open = counts.data.open as number;
  expect(open).toBeGreaterThan(0);

  const badge = nav.getByRole("link", { name: "أسئلة العملاء" }).getByLabel(`${open} سؤال بانتظار الرد`);
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(String(open));
});

test("identity in the rail shows the admin's name from /api/auth/me", async ({ page }) => {
  await loginAsAdmin(page);
  const rail = page.getByTestId("dashboard-rail");
  await expect(rail.getByText(ADMIN_NAME)).toBeVisible();
  await expect(rail.getByText("مسؤول · المصنع")).toBeVisible();
});

test("mobile drawer opens/closes at 390px with focus returning to the trigger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);

  const trigger = page.getByRole("button", { name: "فتح قائمة لوحة الإدارة" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const drawerNav = page.getByRole("navigation", { name: "التنقل في لوحة الإدارة" });
  await expect(page.getByText("قائمة الإدارة")).toBeVisible();
  await expect(drawerNav.getByRole("link", { name: "الطلبات" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawerNav).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("coupon audit round-trip: create then PATCH the name, GET the audit API and see the exact diff", async ({ page }) => {
  await loginAsAdmin(page);

  const code = `AUDIT-${uniqueSuffix}`;
  const createRes = await page.request.post("/api/admin/coupons", {
    data: { code, discountType: "PERCENT", discountValue: 10, active: true },
  });
  expect(createRes.ok()).toBeTruthy();
  const created = await createRes.json();
  couponId = created.data.id as string;

  const patchRes = await page.request.patch(`/api/admin/coupons/${couponId}`, {
    data: { code: `${code}-RENAMED` },
  });
  expect(patchRes.ok()).toBeTruthy();

  const auditRes = await page.request.get(`/api/admin/audit?entityType=coupon&entityId=${couponId}`);
  expect(auditRes.ok()).toBeTruthy();
  const audit = await auditRes.json();
  const items = audit.data.items as Array<{ action: string; before: unknown; after: unknown; actorUserId: string }>;

  expect(items).toHaveLength(2);
  const [updateRow, createRow] = items; // newest first
  expect(updateRow.action).toBe("update");
  expect(updateRow.before).toEqual({ code });
  expect(updateRow.after).toEqual({ code: `${code}-RENAMED` });
  expect(updateRow.actorUserId).toBe(adminUserId);
  expect(createRow.action).toBe("create");
});

test("a customer session hitting the admin audit API gets 403, a signed-out request gets 401", async ({ page, browser }) => {
  const customerPassword = "AdminShellCust123!";
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill("1099966002");
  await page.getByLabel("كلمة المرور").fill(customerPassword);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
  const res = await page.request.get("/api/admin/audit");
  expect(res.status()).toBe(403);

  const context = await browser.newContext();
  const guestPage = await context.newPage();
  const guestRes = await guestPage.request.get("/api/admin/audit");
  expect(guestRes.status()).toBe(401);
  await context.close();
});
