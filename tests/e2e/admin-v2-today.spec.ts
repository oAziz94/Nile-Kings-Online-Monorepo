import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 9.2 (اليوم — the admin's queue) coverage: the six queue cards' fixture rows, the
 * four KPI tiles, the queue bell's dropdown counts matching the API, the آخر النشاط audit
 * sentence, 401/403 on `GET /api/admin/today`, and 390×844 stacking with no horizontal
 * overflow. Serial mode, one shared fixture set, `afterAll` cleanup of every row created
 * (including the audit rows the coupon test writes).
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

const ADMIN_PHONE = "+201099966101";
const ADMIN_PASSWORD = "AdminTodayTest123!";
const ADMIN_NAME = "مسؤول اختبار اليوم";
const CUSTOMER_PHONE = "+201099966102";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

let adminUserId: string;
let customerUserId: string;
let pair: PartnerFixturePair;

let categoryId: string;
let productId: string;
let saleVariantId: string;
let lowStockVariantId: string;

let unassignedOrderId: string;
let overdueOrderId: string;
let saleOrderId: string;
let ticketOrderId: string;
let ticketId: string;
let partnerRequestId: string;
let stockReceiptId: string;
let partnerPaymentId: string;
let couponId: string;

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
    create: { phone: CUSTOMER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword("AdminTodayCust123!"), name: `عميل اليوم ${uniqueSuffix}` },
    update: {},
  });
  customerUserId = customer.id;

  // Short shipSlaHours so a backdated CONFIRMED order reads overdue.
  pair = await seedPartnerPair(prisma, { agent: { confirmSlaHours: 50, shipSlaHours: 5 } });

  const category = await prisma.category.create({
    data: { name: `فئة اليوم إدارة ${uniqueSuffix}`, slug: `admin-today-cat-${uniqueSuffix}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج اليوم إدارة ${uniqueSuffix}`, slug: `admin-today-product-${uniqueSuffix}`, active: true },
  });
  productId = product.id;

  const shippingAddress = { governorate: "أسوان", city: "أسوان", street: "شارع الاختبار" };

  // طلبات بلا شريك
  const unassigned = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "CREATED",
      assignedPartnerId: null,
      subtotalPiastres: 5000,
      totalPiastres: 5000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      // The card shows the ROWS_PER_CARD oldest unassigned orders; a production copy carries
      // dozens of real ones, so the fixture must be the oldest to appear in the rows at all.
      createdAt: new Date("2020-01-01T00:00:00Z"),
    },
  });
  unassignedOrderId = unassigned.id;
  allOrderIds.push(unassignedOrderId);

  // متأخرة عند الشريك — CONFIRMED, backdated audit row past the 5h shipSlaHours.
  const overdue = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "CONFIRMED",
      assignedPartnerId: pair.agent.partnerId,
      subtotalPiastres: 8000,
      totalPiastres: 8000,
      shippingAddress: { governorate: "القاهرة", city: "مدينة نصر" },
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
    },
  });
  overdueOrderId = overdue.id;
  allOrderIds.push(overdueOrderId);
  await prisma.orderAuditLog.create({
    data: {
      orderId: overdueOrderId,
      event: "confirmed",
      statusFrom: "CREATED",
      statusTo: "CONFIRMED",
      createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000), // 10h ago > 5h shipSlaHours
    },
  });

  // أصناف نافدة أو قاربت — a sale (DELIVERED, so it drives velocity but is never overdue)
  // against a variant with zero sellable stock for the fixture partner.
  saleVariantId = (
    await prisma.variant.create({
      data: { productId, sku: `ADM-TODAY-LOW-${uniqueSuffix}`, name: "M", pricePiastres: 10000 },
    })
  ).id;
  lowStockVariantId = saleVariantId;
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: saleVariantId, stockAvailable: 0, stockReserved: 0 },
  });
  const saleOrder = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "DELIVERED",
      assignedPartnerId: pair.agent.partnerId,
      subtotalPiastres: 10000,
      totalPiastres: 10000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      items: {
        create: [
          {
            variantId: saleVariantId,
            productName: product.name,
            variantName: "M",
            sku: `ADM-TODAY-LOW-${uniqueSuffix}`,
            quantity: 3,
            unitPricePiastres: 10000,
            totalPiastres: 30000,
          },
        ],
      },
    },
  });
  saleOrderId = saleOrder.id;
  allOrderIds.push(saleOrderId);

  // أسئلة بانتظار الرد
  const ticketOrder = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "SHIPPED",
      assignedPartnerId: pair.agent.partnerId,
      subtotalPiastres: 3000,
      totalPiastres: 3000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
    },
  });
  ticketOrderId = ticketOrder.id;
  allOrderIds.push(ticketOrderId);
  const ticket = await prisma.orderTicket.create({
    data: {
      orderId: ticketOrderId,
      userId: customerUserId,
      subject: "DELIVERY_DELAY",
      contactPhone: CUSTOMER_PHONE,
      status: "OPEN",
      messages: { create: [{ authorRole: "CUSTOMER", authorUserId: customerUserId, body: "أين طلبي؟" }] },
    },
  });
  ticketId = ticket.id;

  // طلبات شراكة جديدة
  const partnerRequest = await prisma.partnerRequest.create({
    data: {
      requestType: "AGENT",
      name: `طالب شراكة ${uniqueSuffix}`,
      governorate: "المنصورة",
      phone: `+2010${uniqueSuffix}`.slice(0, 13),
      status: "PENDING",
    },
  });
  partnerRequestId = partnerRequest.id;

  // مستحقات شركاء — a receipt bigger than the one payment, dueAt yesterday.
  const receipt = await prisma.stockReceipt.create({
    data: { partnerId: pair.agent.partnerId, kind: "FACTORY", totalCostPiastres: 100_000, reference: `RCP-${uniqueSuffix}` },
  });
  stockReceiptId = receipt.id;
  const payment = await prisma.partnerPayment.create({
    data: {
      partnerId: pair.agent.partnerId,
      kind: "INSTALLMENT",
      amountPiastres: 50_000,
      paidAt: new Date(),
      dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      stockReceiptId: receipt.id,
      recordedByUserId: adminUserId,
    },
  });
  partnerPaymentId = payment.id;
});

test.afterAll(async () => {
  if (couponId) {
    await prisma.adminAuditLog.deleteMany({ where: safeWhere({ entityId: couponId }) });
    await prisma.coupon.deleteMany({ where: safeWhere({ id: couponId }) });
  }
  await prisma.orderTicketMessage.deleteMany({ where: safeWhere({ ticketId }) });
  await prisma.orderTicket.deleteMany({ where: safeWhere({ id: ticketId }) });
  // Backlog 9.0b (ii): guard against an undefined id ever reaching a Prisma `where` — passing
  // `undefined` for a scalar field is treated as "no filter", which would delete every
  // PENDING/APPROVED/REJECTED PartnerRequest row in the database if beforeAll ever failed
  // before assigning this id.
  if (partnerRequestId) await prisma.partnerRequest.deleteMany({ where: safeWhere({ id: partnerRequestId }) });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.orderAuditLog.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: allOrderIds } } });
  // `cleanupPartnerPair` deletes `PartnerPayment`/`StockReceipt`/`PartnerInventory` for
  // `pair.agent.partnerId` — must run before the variant delete below, which would
  // otherwise violate `PartnerInventory`'s FK to `Variant`.
  await cleanupPartnerPair(prisma, pair);
  await prisma.variant.deleteMany({ where: safeWhere({ id: saleVariantId }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, customerUserId] } } });
  await prisma.$disconnect();
});

test("the API returns every fixture in its queue with the right counts", async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.get("/api/admin/today");
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  const data = json.data;

  expect(data.queues.unassigned.rows.some((r: { id: string }) => r.id === unassignedOrderId)).toBeTruthy();
  expect(data.queues.unassigned.count).toBeGreaterThanOrEqual(1);

  const overdueRow = data.queues.overdue.rows.find((r: { id: string }) => r.id === overdueOrderId);
  expect(overdueRow).toBeTruthy();
  expect(overdueRow.overdueHours).toBeGreaterThanOrEqual(1);
  expect(data.queues.overdue.count).toBeGreaterThanOrEqual(1);

  expect(data.queues.tickets.rows.some((r: { id: string }) => r.id === ticketId)).toBeTruthy();
  expect(data.queues.tickets.count).toBeGreaterThanOrEqual(1);

  expect(data.queues.partnerRequests.rows.some((r: { id: string }) => r.id === partnerRequestId)).toBeTruthy();
  expect(data.queues.partnerRequests.count).toBeGreaterThanOrEqual(1);

  expect(data.queues.lowStock.rows.some((r: { variantId: string }) => r.variantId === lowStockVariantId)).toBeTruthy();
  expect(data.queues.lowStock.count).toBeGreaterThanOrEqual(1);

  const dueRow = data.queues.duePayments.rows.find((r: { partnerId: string }) => r.partnerId === pair.agent.partnerId);
  expect(dueRow).toBeTruthy();
  expect(dueRow.overdue).toBe(true);
  expect(data.queues.duePayments.count).toBeGreaterThanOrEqual(1);

  expect(typeof data.kpis.ordersToday).toBe("number");
  expect(typeof data.kpis.onTimeRate30).toBe("number");
});

test("اليوم renders every fixture card and Western-numeral KPIs", async ({ page }) => {
  await loginAsAdmin(page);

  await expect(page.getByTestId(`queue-unassigned-row-${unassignedOrderId}`)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId(`queue-overdue-row-${overdueOrderId}`)).toBeVisible();
  await expect(page.getByTestId(`queue-overdue-row-${overdueOrderId}`)).toContainText("تجاوز المهلة");
  await expect(page.getByTestId(`queue-tickets-row-${ticketId}`)).toBeVisible();
  await expect(page.getByTestId(`queue-partner-requests-row-${partnerRequestId}`)).toBeVisible();
  await expect(page.getByTestId(`queue-low-stock-row-${lowStockVariantId}`)).toBeVisible();
  await expect(page.getByTestId(`queue-due-payments-row-${pair.agent.partnerId}`)).toBeVisible();
  await expect(page.getByTestId(`queue-due-payments-row-${pair.agent.partnerId}`)).toContainText("استحق منذ");

  const apiRes = await page.request.get("/api/admin/today");
  const apiData = (await apiRes.json()).data;
  await expect(page.getByTestId("kpi-orders-today")).toContainText(String(apiData.kpis.ordersToday));

  // No Arabic-Indic digits anywhere in the KPI strip.
  const kpiText = await page.getByTestId("kpi-orders-today").innerText();
  expect(/[٠-٩]/.test(kpiText)).toBe(false);
});

test("the queue bell's dropdown counts equal the API", async ({ page }) => {
  await loginAsAdmin(page);

  const apiRes = await page.request.get("/api/admin/today");
  const apiData = (await apiRes.json()).data;
  const total =
    apiData.queues.unassigned.count +
    apiData.queues.overdue.count +
    apiData.queues.tickets.count +
    apiData.queues.partnerRequests.count +
    apiData.queues.lowStock.count +
    apiData.queues.duePayments.count;
  expect(total).toBeGreaterThan(0);

  const bell = page.getByRole("button", { name: /طابور اليوم/ });
  await bell.click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem", { name: "طلبات بلا شريك" })).toContainText(
    String(apiData.queues.unassigned.count)
  );
  await expect(menu.getByRole("menuitem", { name: "متأخرة عند الشريك" })).toContainText(
    String(apiData.queues.overdue.count)
  );
});

test("آخر النشاط shows the plain-Arabic sentence for a coupon created through the API", async ({ page }) => {
  await loginAsAdmin(page);
  const code = `ADMTODAY-${uniqueSuffix}`;
  const createRes = await page.request.post("/api/admin/coupons", {
    data: { code, discountType: "PERCENT", discountValue: 5, active: true },
  });
  expect(createRes.ok()).toBeTruthy();
  couponId = (await createRes.json()).data.id;

  await page.goto("/admin");
  await expect(page.getByTestId("recent-activity")).toContainText(`أنشأ الكوبون ${code}`, { timeout: 20_000 });
});

test("401 signed-out, 403 for a customer", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(CUSTOMER_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill("AdminTodayCust123!");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
  const res = await page.request.get("/api/admin/today");
  expect(res.status()).toBe(403);

  const context = await browser.newContext();
  const guestPage = await context.newPage();
  const guestRes = await guestPage.request.get("/api/admin/today");
  expect(guestRes.status()).toBe(401);
  await context.close();
});

test("at 390×844 the six cards stack with no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  await expect(page.getByTestId(`queue-unassigned-row-${unassignedOrderId}`)).toBeVisible({ timeout: 20_000 });

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);
});
