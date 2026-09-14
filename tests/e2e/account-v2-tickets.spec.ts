import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

/**
 * Backlog 6.5a (order tickets — schema, customer API, customer UI) coverage. Same seeded-
 * fixture-user + scrypt-hash pattern as `account-v2-orders.spec.ts`, with a distinct fixture
 * phone and its own test-only category/product/variant/order so cleanup never touches another
 * spec's rows. Run against the redesign Neon branch only (test-env.ts's production guard).
 *
 * Tests run serial and share one seeded DELIVERED order + its one ticket across the lifecycle
 * (create -> admin reply -> customer reply -> close -> duplicate-POST 409), because the ticket
 * model is one-per-order by design (`@@unique([orderId])`) — the "second POST -> 409" and
 * "another customer -> 404" checks need that same ticket/order to already exist.
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

const FIXTURE_PHONE = "+201099955667";
const FIXTURE_PASSWORD = "TicketsTest123!";
const OTHER_PHONE = "+201099955668";
const OTHER_PASSWORD = "TicketsOther123!";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.describe.configure({ mode: "serial" });

const shippingAddress = {
  governorate: "القاهرة",
  city: "مدينة نصر",
  area: "الحي السابع",
  street: "12 شارع اختبار التذاكر",
  phone: "+201000000222",
};

let fixtureUserId: string;
let otherUserId: string;
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

async function login(page: Page, phone: string, password: string) {
  await setGovernorate(page);
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(phone.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 15000 });
}

function cardFor(page: Page, id: string) {
  return page.locator("article", { hasText: `#${id.slice(-8).toUpperCase()}` });
}

test.beforeAll(async () => {
  const fixtureUser = await prisma.user.upsert({
    where: { phone: FIXTURE_PHONE },
    create: { phone: FIXTURE_PHONE, role: "CUSTOMER", passwordHash: await hashPassword(FIXTURE_PASSWORD), name: "عميل اختبار التذاكر" },
    update: { passwordHash: await hashPassword(FIXTURE_PASSWORD), role: "CUSTOMER" },
  });
  fixtureUserId = fixtureUser.id;

  const otherUser = await prisma.user.upsert({
    where: { phone: OTHER_PHONE },
    create: { phone: OTHER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword(OTHER_PASSWORD), name: "عميل آخر" },
    update: { passwordHash: await hashPassword(OTHER_PASSWORD), role: "CUSTOMER" },
  });
  otherUserId = otherUser.id;

  const adminUser = await prisma.user.create({
    data: { phone: `+20${uniqueSuffix}`, role: "ADMIN", passwordHash: await hashPassword("x"), name: "خدمة العملاء" },
  });
  adminUserId = adminUser.id;

  const category = await prisma.category.create({
    data: { name: `فئة اختبار التذاكر ${uniqueSuffix}`, slug: `test-cat-tickets-${uniqueSuffix}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج اختبار التذاكر ${uniqueSuffix}`, slug: `test-product-tickets-${uniqueSuffix}`, weightGrams: 200 },
  });
  productId = product.id;
  const variant = await prisma.variant.create({
    data: { productId, sku: `TEST-TKT-${uniqueSuffix}`, name: "M", pricePiastres: 5000 },
  });
  variantId = variant.id;

  const order = await prisma.order.create({
    data: {
      userId: fixtureUserId,
      status: "DELIVERED",
      subtotalPiastres: 5000,
      totalPiastres: 5000,
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
  await prisma.orderTicketMessage.deleteMany({ where: { ticket: { orderId } } });
  await prisma.orderTicket.deleteMany({ where: { orderId } });
  await prisma.orderItem.deleteMany({ where: { orderId } });
  await prisma.order.deleteMany({ where: { id: orderId } });
  await prisma.variant.deleteMany({ where: { id: variantId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { id: { in: [fixtureUserId, otherUserId, adminUserId] } } });
  await prisma.$disconnect();
});

test("a message under 10 characters shows an inline error and sends no request", async ({ page }) => {
  await login(page, FIXTURE_PHONE, FIXTURE_PASSWORD);
  await page.goto("/profile/orders");
  const card = cardFor(page, orderId);

  let ticketPostFired = false;
  await page.route("**/api/profile/orders/**/ticket", (route) => {
    if (route.request().method() === "POST") ticketPostFired = true;
    return route.continue();
  });

  await card.getByRole("button", { name: "سؤال عن الطلب" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: "تأخير في التوصيل" }).click();
  await dialog.getByLabel("رسالتك").fill("قصير");
  await expect(dialog.getByLabel("رقم للتواصل")).toHaveValue(FIXTURE_PHONE);
  await dialog.getByRole("button", { name: "إرسال السؤال" }).click();

  await expect(dialog.getByRole("alert")).toContainText("الرسالة يجب أن تكون بين");
  await expect(dialog).toBeVisible();
  expect(ticketPostFired).toBe(false);

  await page.unroute("**/api/profile/orders/**/ticket");
});

test("creating a ticket from the UI shows OPEN on the thread and the footer button", async ({ page }) => {
  await login(page, FIXTURE_PHONE, FIXTURE_PASSWORD);
  await page.goto("/profile/orders");
  const card = cardFor(page, orderId);

  await card.getByRole("button", { name: "سؤال عن الطلب" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("radio", { name: "تأخير في التوصيل" }).click();
  await dialog.getByLabel("رسالتك").fill("الطلب متأخر عن الموعد المتوقع بيومين، هل يمكن معرفة السبب؟");
  await expect(dialog.getByLabel("رقم للتواصل")).toHaveValue(FIXTURE_PHONE);
  await dialog.getByRole("button", { name: "إرسال السؤال" }).click();

  await expect(dialog).toBeHidden();
  await expect(card.getByRole("button", { name: /سؤالك · بانتظار الرد/ })).toBeVisible();
  await expect(card.getByText("بانتظار الرد").first()).toBeVisible();

  const ticket = await prisma.orderTicket.findUniqueOrThrow({ where: { orderId } });
  ticketId = ticket.id;
  expect(ticket.status).toBe("OPEN");
});

test("an admin reply flips the ticket to ANSWERED; reload shows the gold-edged bubble", async ({ page }) => {
  await prisma.orderTicketMessage.create({
    data: {
      ticketId,
      authorRole: "ADMIN",
      authorUserId: adminUserId,
      body: "أهلًا، الشحنة مع المندوب وستصلك غدًا. نعتذر عن التأخير.",
    },
  });
  await prisma.orderTicket.update({ where: { id: ticketId }, data: { status: "ANSWERED" } });

  await login(page, FIXTURE_PHONE, FIXTURE_PASSWORD);
  await page.goto("/profile/orders");
  const card = cardFor(page, orderId);

  await card.getByRole("button", { name: /سؤالك/ }).click();
  await expect(card.getByText("تم الرد").first()).toBeVisible();

  const adminBubble = card.getByText("أهلًا، الشحنة مع المندوب وستصلك غدًا. نعتذر عن التأخير.");
  await expect(adminBubble).toBeVisible();
  await expect(adminBubble).toHaveCSS("border-inline-end-width", "2px");
});

test("a customer reply reopens the ticket to OPEN", async ({ page }) => {
  await login(page, FIXTURE_PHONE, FIXTURE_PASSWORD);
  await page.goto("/profile/orders");
  const card = cardFor(page, orderId);

  await card.getByRole("button", { name: /سؤالك/ }).click();
  await expect(card.getByText("تم الرد").first()).toBeVisible();

  await card.getByPlaceholder("اكتب ردًا…").fill("شكرًا لكم، بانتظار الشحنة.");
  await card.getByRole("button", { name: "إرسال" }).click();

  await expect(card.getByText("بانتظار الرد").first()).toBeVisible();
  await expect(card.getByText("شكرًا لكم، بانتظار الشحنة.")).toBeVisible();
});

test("closing the ticket shows CLOSED and the reopen note on the reply box", async ({ page }) => {
  await login(page, FIXTURE_PHONE, FIXTURE_PASSWORD);
  await page.goto("/profile/orders");
  const card = cardFor(page, orderId);

  await card.getByRole("button", { name: /سؤالك/ }).click();
  await expect(card.getByText("بانتظار الرد").first()).toBeVisible();

  await card.getByRole("button", { name: "إغلاق السؤال" }).click();

  await expect(card.getByText("مغلقة").first()).toBeVisible();
  await expect(card.getByText("أُغلق السؤال — يمكنك الكتابة لإعادة فتحه.")).toBeVisible();
  await expect(card.getByRole("button", { name: "إغلاق السؤال" })).toHaveCount(0);
  await expect(card.getByPlaceholder("اكتب ردًا…")).toBeVisible();
});

test("a second ticket creation on the same order is rejected with 409", async ({ page }) => {
  await login(page, FIXTURE_PHONE, FIXTURE_PASSWORD);
  const res = await page.request.post(`/api/profile/orders/${orderId}/ticket`, {
    data: {
      subject: "DELIVERY_DELAY",
      body: "محاولة فتح سؤال ثانٍ على نفس الطلب.",
      contactPhone: FIXTURE_PHONE,
    },
  });
  expect(res.status()).toBe(409);
});

test("another customer's session gets 404 on GET", async ({ page }) => {
  await login(page, OTHER_PHONE, OTHER_PASSWORD);
  const res = await page.request.get(`/api/profile/orders/${orderId}/ticket`);
  expect(res.status()).toBe(404);
});
