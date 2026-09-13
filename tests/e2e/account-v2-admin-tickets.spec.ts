import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

/**
 * Backlog 6.5b (admin ticket inbox + reply) coverage. Same seeded-fixture-user pattern as
 * `account-v2-tickets.spec.ts`: a CUSTOMER fixture with a DELIVERED order and one OPEN ticket
 * (one CUSTOMER message, seeded via Prisma), plus an ADMIN fixture that logs in through the UI.
 * Tests run serial and share the one seeded ticket across its lifecycle (inbox -> reply ->
 * customer sees it -> close -> reopen), then cover the auth-only checks against the admin API.
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

const CUSTOMER_PHONE = "+201099944771";
const CUSTOMER_PASSWORD = "AdminTicketsCust123!";
const ADMIN_PHONE = "+201099944772";
const ADMIN_PASSWORD = "AdminTicketsAdmin123!";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.describe.configure({ mode: "serial" });

const shippingAddress = {
  governorate: "القاهرة",
  city: "مدينة نصر",
  area: "الحي الثامن",
  street: "3 شارع اختبار لوحة التحكم",
  phone: "+201000000333",
};

let customerUserId: string;
let adminUserId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let orderId: string;
let ticketId: string;

async function setGovernorate(page: Page) {
  const res = await page.request.post("/api/storefront/governorate", { data: { governorate: "القاهرة" } });
  expect(res.ok()).toBeTruthy();
}

async function loginAsCustomer(page: Page) {
  await setGovernorate(page);
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(CUSTOMER_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(CUSTOMER_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 15000 });
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 15000 });
}

test.beforeAll(async () => {
  const customer = await prisma.user.upsert({
    where: { phone: CUSTOMER_PHONE },
    create: {
      phone: CUSTOMER_PHONE,
      role: "CUSTOMER",
      passwordHash: await hashPassword(CUSTOMER_PASSWORD),
      name: "عميل اختبار لوحة الإدارة",
    },
    update: { passwordHash: await hashPassword(CUSTOMER_PASSWORD), role: "CUSTOMER" },
  });
  customerUserId = customer.id;

  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: {
      phone: ADMIN_PHONE,
      role: "ADMIN",
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      name: "مسؤول اختبار",
    },
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
  });
  adminUserId = admin.id;

  const category = await prisma.category.create({
    data: { name: `فئة اختبار لوحة التحكم ${uniqueSuffix}`, slug: `test-cat-admin-tkt-${uniqueSuffix}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج اختبار لوحة التحكم ${uniqueSuffix}`, slug: `test-product-admin-tkt-${uniqueSuffix}`, weightGrams: 200 },
  });
  productId = product.id;
  const variant = await prisma.variant.create({
    data: { productId, sku: `TEST-ADM-TKT-${uniqueSuffix}`, name: "M", pricePiastres: 6000, stockAvailable: 0, stockReserved: 0 },
  });
  variantId = variant.id;

  const order = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "DELIVERED",
      subtotalPiastres: 6000,
      totalPiastres: 6000,
      shippingAddress,
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
            unitPricePiastres: 6000,
            totalPiastres: 6000,
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
      contactPhone: CUSTOMER_PHONE,
      status: "OPEN",
      messages: {
        create: [
          {
            authorRole: "CUSTOMER",
            authorUserId: customerUserId,
            body: "الطلب متأخر عن الموعد المتوقع، هل يمكن معرفة السبب من فضلكم؟",
          },
        ],
      },
    },
  });
  ticketId = ticket.id;
});

test.afterAll(async () => {
  await prisma.orderTicketMessage.deleteMany({ where: { ticketId } });
  await prisma.orderTicket.deleteMany({ where: { id: ticketId } });
  await prisma.orderItem.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
  await prisma.variant.deleteMany({ where: { id: variantId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { id: { in: [customerUserId, adminUserId] } } });
  await prisma.$disconnect();
});

test("the seeded OPEN ticket appears in the inbox under بانتظار الرد, and the nav badge shows it", async ({ page }) => {
  await loginAsAdmin(page);

  const navBadge = page.getByRole("link", { name: /أسئلة العملاء/ }).getByLabel(/سؤال بانتظار الرد/);
  await expect(navBadge).toBeVisible();

  await page.goto("/admin/order-tickets");
  await expect(page.getByRole("tab", { name: /بانتظار الرد/ })).toHaveAttribute("aria-selected", "true");

  const row = page.getByRole("row").filter({ hasText: orderId.slice(-8).toUpperCase() });
  await expect(row).toBeVisible();
  await expect(row.getByText("عميل اختبار لوحة الإدارة")).toBeVisible();
});

test("an admin reply flips the ticket to ANSWERED and the counts move", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/order-tickets/${ticketId}`);

  await expect(page.getByText("الطلب متأخر عن الموعد المتوقع، هل يمكن معرفة السبب من فضلكم؟")).toBeVisible();

  await page.getByLabel("الرد على العميل").fill("أهلًا، تم تأكيد موعد التسليم غدًا صباحًا. نعتذر عن التأخير.");
  await page.getByRole("button", { name: "إرسال الرد" }).click();

  await expect(page.getByText("تم إرسال الرد").first()).toBeVisible();
  await expect(page.getByText("أهلًا، تم تأكيد موعد التسليم غدًا صباحًا. نعتذر عن التأخير.")).toBeVisible();

  await page.goto("/admin/order-tickets");
  await expect(page.getByRole("tab", { name: /بانتظار الرد/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("row").filter({ hasText: orderId.slice(-8).toUpperCase() })).toHaveCount(0);
  await page.getByRole("tab", { name: /تم الرد/ }).click();
  await expect(page.getByRole("row").filter({ hasText: orderId.slice(-8).toUpperCase() })).toBeVisible();
});

test("a second browser context logged in as the customer sees the reply with the gold edge", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAsCustomer(page);
  await page.goto("/profile/orders");

  const card = page.locator("article", { hasText: `#${orderId.slice(-8).toUpperCase()}` });
  await card.getByRole("button", { name: /سؤالك/ }).click();
  await expect(card.getByText("تم الرد").first()).toBeVisible();

  const adminBubble = card.getByText("أهلًا، تم تأكيد موعد التسليم غدًا صباحًا. نعتذر عن التأخير.");
  await expect(adminBubble).toBeVisible();
  await expect(adminBubble).toHaveCSS("border-inline-end-width", "2px");

  await context.close();
});

test("closing from admin shows مغلقة, then reopening shows بانتظار الرد", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/order-tickets/${ticketId}`);

  await page.getByRole("button", { name: "إغلاق السؤال" }).click();
  await expect(page.getByText("تم إغلاق السؤال").first()).toBeVisible();
  await expect(page.getByText("مغلقة", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "إعادة فتح" }).click();
  await expect(page.getByText("تمت إعادة فتح السؤال").first()).toBeVisible();
  await expect(page.getByText("بانتظار الرد", { exact: true })).toBeVisible();
});

test("a customer session hitting the admin API gets 403", async ({ page }) => {
  await loginAsCustomer(page);
  const res = await page.request.get("/api/admin/order-tickets");
  expect(res.status()).toBe(403);
});

test("a signed-out request gets 401", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.request.get("/api/admin/order-tickets");
  expect(res.status()).toBe(401);
  await context.close();
});
