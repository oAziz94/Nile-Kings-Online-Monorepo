import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

/**
 * Backlog 9.3 (الطلبات — the network pipeline + the order detail with admin powers)
 * coverage: stage counts and the بلا شريك stage, the partner filter, opening by number/row/
 * فتح, assign, reassign, insufficient-stock assignment, cancel with reason, proof of
 * delivery, a ticket reply from the detail, bulk assign, the routed-orders redirects, and
 * 401/403 on the new routes. Serial mode, one shared fixture set, `afterAll` cleanup of
 * every row created (orders, routed rows, ledger rows, audit rows).
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

const ADMIN_PHONE = "+201099966201";
const ADMIN_PASSWORD = "AdminOrdersTest123!";
const ADMIN_NAME = "مسؤول اختبار الطلبات";
const CUSTOMER_PHONE = "+201099966202";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

let adminUserId: string;
let customerUserId: string;
let pair: PartnerFixturePair;

let categoryId: string;
let productId: string;
let variantAId: string; // both partners stock this
let variantBId: string; // only the agent stocks this
let variantBSku: string;
let variantCId: string; // both partners stock this — used by the CONFIRMED assign/reassign case

let unassignedOrderId: string; // assigned → reassigned → cancelled across tests C/D/E/F
let filterOrderId: string; // pre-assigned to the agent, used for the partner filter/proof/ticket
let insufficientOrderId: string; // unassigned, variantB — the distributor can't cover it
let bulkOrderId1: string;
let bulkOrderId2: string;
let confirmedUnassignedOrderId: string; // CONFIRMED, no partner — the reservation-vs-commit regression case
let ticketId: string;
let routedOrderIdForRedirect: string;

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
    create: { phone: CUSTOMER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword("AdminOrdersCust123!"), name: `عميل الطلبات ${uniqueSuffix}` },
    update: {},
  });
  customerUserId = customer.id;

  pair = await seedPartnerPair(prisma);

  const category = await prisma.category.create({
    data: { name: `فئة طلبات إدارة ${uniqueSuffix}`, slug: `admin-orders-cat-${uniqueSuffix}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج طلبات إدارة ${uniqueSuffix}`, slug: `admin-orders-product-${uniqueSuffix}`, active: true, weightGrams: 300 },
  });
  productId = product.id;

  const variantA = await prisma.variant.create({
    data: { productId, sku: `AO-A-${uniqueSuffix}`, name: "L", colorName: "أسود", pricePiastres: 20000 },
  });
  variantAId = variantA.id;
  const variantB = await prisma.variant.create({
    data: { productId, sku: `AO-B-${uniqueSuffix}`, name: "M", colorName: "أبيض", pricePiastres: 18000 },
  });
  variantBId = variantB.id;
  variantBSku = variantB.sku;
  const variantC = await prisma.variant.create({
    data: { productId, sku: `AO-C-${uniqueSuffix}`, name: "S", colorName: "أحمر", pricePiastres: 15000 },
  });
  variantCId = variantC.id;

  await prisma.partnerInventory.createMany({
    data: [
      { partnerId: pair.agent.partnerId, variantId: variantAId, stockAvailable: 10, stockReserved: 0 },
      { partnerId: pair.distributor.partnerId, variantId: variantAId, stockAvailable: 10, stockReserved: 0 },
      { partnerId: pair.agent.partnerId, variantId: variantBId, stockAvailable: 10, stockReserved: 0 },
      { partnerId: pair.distributor.partnerId, variantId: variantBId, stockAvailable: 0, stockReserved: 0 },
      { partnerId: pair.agent.partnerId, variantId: variantCId, stockAvailable: 50, stockReserved: 0 },
      { partnerId: pair.distributor.partnerId, variantId: variantCId, stockAvailable: 50, stockReserved: 0 },
    ],
  });

  const shippingAddress = { governorate: "القاهرة", city: "القاهرة", area: "مدينة نصر", street: "شارع الاختبار" };

  async function createOrder(opts: {
    variantId: string;
    sku: string;
    quantity: number;
    assignedPartnerId?: string;
    status?: "CREATED" | "CONFIRMED";
  }) {
    const unitPrice = 20000;
    const order = await prisma.order.create({
      data: {
        userId: customerUserId,
        status: opts.status ?? "CREATED",
        assignedPartnerId: opts.assignedPartnerId ?? null,
        subtotalPiastres: unitPrice * opts.quantity,
        totalPiastres: unitPrice * opts.quantity,
        shippingAddress,
        shippingProvider: "Egypt Post",
        paymentMethod: "COD",
        items: {
          create: [
            {
              variantId: opts.variantId,
              productName: product.name,
              variantName: `${product.slug}-${opts.sku}`,
              sku: opts.sku,
              quantity: opts.quantity,
              unitPricePiastres: unitPrice,
              totalPiastres: unitPrice * opts.quantity,
            },
          ],
        },
      },
    });
    allOrderIds.push(order.id);
    return order.id;
  }

  unassignedOrderId = await createOrder({ variantId: variantAId, sku: variantA.sku, quantity: 2 });
  insufficientOrderId = await createOrder({ variantId: variantBId, sku: variantB.sku, quantity: 5 });
  bulkOrderId1 = await createOrder({ variantId: variantAId, sku: variantA.sku, quantity: 1 });
  bulkOrderId2 = await createOrder({ variantId: variantAId, sku: variantA.sku, quantity: 1 });
  confirmedUnassignedOrderId = await createOrder({ variantId: variantCId, sku: variantC.sku, quantity: 1, status: "CONFIRMED" });

  filterOrderId = await createOrder({ variantId: variantAId, sku: variantA.sku, quantity: 1, assignedPartnerId: pair.agent.partnerId });
  const filterRouted = await prisma.routedOrder.create({
    data: { orderId: filterOrderId, governorate: "القاهرة", partnerId: pair.agent.partnerId, assignmentMode: "AUTO", status: "ASSIGNED" },
  });
  routedOrderIdForRedirect = filterRouted.id;
  await prisma.partnerInventory.update({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: variantAId } },
    data: { stockReserved: { increment: 1 } },
  });

  const ticket = await prisma.orderTicket.create({
    data: { orderId: filterOrderId, userId: customerUserId, subject: "DELIVERY_DELAY", status: "OPEN", contactPhone: CUSTOMER_PHONE },
  });
  ticketId = ticket.id;
});

test.afterAll(async () => {
  await prisma.orderTicketMessage.deleteMany({ where: { ticketId } });
  await prisma.orderTicket.deleteMany({ where: { id: ticketId } });
  await prisma.adminAuditLog.deleteMany({ where: { entityId: { in: allOrderIds } } });
  await prisma.inventoryLedger.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.orderAuditLog.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.routedOrder.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: allOrderIds } } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.variant.deleteMany({ where: { id: { in: [variantAId, variantBId, variantCId] } } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, customerUserId] } } });
  await prisma.$disconnect();
});

test("stage counts and the بلا شريك stage list the unassigned fixture", async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.get("/api/admin/orders?stage=UNASSIGNED&limit=100");
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.data.orders.some((o: { id: string }) => o.id === unassignedOrderId)).toBeTruthy();
  expect(json.data.orders.some((o: { id: string }) => o.id === insufficientOrderId)).toBeTruthy();
  expect(json.data.counts.UNASSIGNED).toBeGreaterThanOrEqual(2);

  await page.goto("/admin/orders?stage=UNASSIGNED");
  // The desktop `<table>` and the mobile card list both carry `data-row-id` — scope to the
  // desktop table (this suite runs at the default desktop viewport).
  await expect(page.locator(`table [data-row-id="${unassignedOrderId}"]`)).toBeVisible({ timeout: 20_000 });
});

test("the partner filter narrows to that partner's orders", async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.get(`/api/admin/orders?partner=${pair.agent.partnerId}&limit=100`);
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  const ids = json.data.orders.map((o: { id: string }) => o.id);
  expect(ids).toContain(filterOrderId);
  expect(ids).not.toContain(unassignedOrderId);
});

test("open by number, row and فتح all reach the detail", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/orders?stage=UNASSIGNED");
  await page.getByRole("link", { name: `#${unassignedOrderId.slice(0, 8)}` }).click();
  await expect(page).toHaveURL(`/admin/orders/${unassignedOrderId}`, { timeout: 20_000 });
});

test("assign the unassigned order to the agent", async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.post(`/api/admin/orders/${unassignedOrderId}/assign`, {
    data: { partnerId: pair.agent.partnerId, notes: "test assign" },
  });
  expect(res.ok()).toBeTruthy();

  const order = await prisma.order.findUniqueOrThrow({ where: { id: unassignedOrderId } });
  expect(order.assignedPartnerId).toBe(pair.agent.partnerId);

  const routed = await prisma.routedOrder.findUniqueOrThrow({ where: { orderId: unassignedOrderId } });
  expect(routed.assignmentMode).toBe("MANUAL");
  expect(routed.status).toBe("ASSIGNED");

  const inv = await prisma.partnerInventory.findUniqueOrThrow({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: variantAId } },
  });
  expect(inv.stockReserved).toBeGreaterThanOrEqual(2);

  const audit = await prisma.adminAuditLog.findFirst({
    where: { entityId: unassignedOrderId, action: "assign" },
    orderBy: { createdAt: "desc" },
  });
  expect(audit).toBeTruthy();
});

test("reassign to the second partner moves the reservation", async ({ page }) => {
  await loginAsAdmin(page);
  const before = await prisma.partnerInventory.findUniqueOrThrow({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: variantAId } },
  });

  const res = await page.request.post(`/api/admin/orders/${unassignedOrderId}/assign`, {
    data: { partnerId: pair.distributor.partnerId, notes: "test reassign" },
  });
  expect(res.ok()).toBeTruthy();

  const order = await prisma.order.findUniqueOrThrow({ where: { id: unassignedOrderId } });
  expect(order.assignedPartnerId).toBe(pair.distributor.partnerId);

  const after = await prisma.partnerInventory.findUniqueOrThrow({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: variantAId } },
  });
  expect(after.stockReserved).toBeLessThan(before.stockReserved);

  const distInv = await prisma.partnerInventory.findUniqueOrThrow({
    where: { partnerId_variantId: { partnerId: pair.distributor.partnerId, variantId: variantAId } },
  });
  expect(distInv.stockReserved).toBeGreaterThanOrEqual(2);

  const audit = await prisma.adminAuditLog.findFirst({
    where: { entityId: unassignedOrderId, action: "reassign" },
    orderBy: { createdAt: "desc" },
  });
  expect(audit).toBeTruthy();
});

/**
 * Regression for 9.3 rework #1 (verifier-found, CRITICAL): a CONFIRMED order is past the
 * reservation-only stage (`orderUsesPartnerReservationOnly("CONFIRMED") === false`) — its
 * first-time assign must COMMIT the reservation immediately, not just reserve it, exactly
 * like a reassign's new-partner side already does. Before the fix, a fresh assign of this
 * order left the agent at 49 available / 1 reserved (still "held", never settled); after the
 * fix it lands at 49 available / 0 reserved. Reassigning away must then fully restore the
 * agent (50/0) and land the distributor at the same committed state (49/0) — never leave a
 * phantom reservation behind on either partner.
 */
test("a CONFIRMED unassigned order commits stock on first assign, and reassign settles both partners exactly", async ({ page }) => {
  await loginAsAdmin(page);

  const agentBefore = await prisma.partnerInventory.findUniqueOrThrow({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: variantCId } },
  });
  expect(agentBefore.stockAvailable).toBe(50);
  expect(agentBefore.stockReserved).toBe(0);

  const assignRes = await page.request.post(`/api/admin/orders/${confirmedUnassignedOrderId}/assign`, {
    data: { partnerId: pair.agent.partnerId },
  });
  expect(assignRes.ok()).toBeTruthy();

  const agentAfterAssign = await prisma.partnerInventory.findUniqueOrThrow({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: variantCId } },
  });
  // Expected (committed, per the fix): available 49, reserved 0.
  // Actual before the fix (bug): available 50, reserved 1.
  expect(agentAfterAssign.stockAvailable).toBe(49);
  expect(agentAfterAssign.stockReserved).toBe(0);

  const reassignRes = await page.request.post(`/api/admin/orders/${confirmedUnassignedOrderId}/assign`, {
    data: { partnerId: pair.distributor.partnerId },
  });
  expect(reassignRes.ok()).toBeTruthy();

  const agentAfterReassign = await prisma.partnerInventory.findUniqueOrThrow({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: variantCId } },
  });
  // The agent must be fully restored — no leaked reservation.
  expect(agentAfterReassign.stockAvailable).toBe(50);
  expect(agentAfterReassign.stockReserved).toBe(0);

  const distAfterReassign = await prisma.partnerInventory.findUniqueOrThrow({
    where: { partnerId_variantId: { partnerId: pair.distributor.partnerId, variantId: variantCId } },
  });
  expect(distAfterReassign.stockAvailable).toBe(49);
  expect(distAfterReassign.stockReserved).toBe(0);
});

test("assigning to a partner with insufficient stock names the SKU in a 409", async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.post(`/api/admin/orders/${insufficientOrderId}/assign`, {
    data: { partnerId: pair.distributor.partnerId },
  });
  expect(res.status()).toBe(409);
  const json = await res.json();
  expect(json.error.message).toContain(variantBSku);
});

test("cancel with reason releases the reservation and stores the reason", async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.patch(`/api/admin/orders/${unassignedOrderId}`, {
    data: { status: "CANCELLED", cancellationReason: "العميل غيّر رأيه" },
  });
  expect(res.ok()).toBeTruthy();

  const order = await prisma.order.findUniqueOrThrow({ where: { id: unassignedOrderId } });
  expect(order.status).toBe("CANCELLED");
  expect(order.cancellationReason).toBe("العميل غيّر رأيه");

  const audit = await prisma.adminAuditLog.findFirst({
    where: { entityId: unassignedOrderId, action: "cancel" },
    orderBy: { createdAt: "desc" },
  });
  expect(audit).toBeTruthy();
});

test("proof of delivery PATCH renders a thumbnail on the detail page", async ({ page }) => {
  await loginAsAdmin(page);
  const proofUrl = "https://res.cloudinary.com/demo/image/upload/sample.jpg";
  const res = await page.request.patch(`/api/admin/orders/${filterOrderId}/proof`, {
    data: { proofImageUrl: proofUrl },
  });
  expect(res.ok()).toBeTruthy();

  await page.goto(`/admin/orders/${filterOrderId}`);
  await expect(page.getByRole("img", { name: "إثبات التسليم" })).toBeVisible({ timeout: 20_000 });
});

test("a ticket reply from the detail is visible in the tickets inbox thread", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/orders/${filterOrderId}`);
  const replyText = `رد اختبار ${uniqueSuffix}`;
  const replyBox = page.getByPlaceholder("اكتب ردًا يراه العميل تحت طلبه…");
  await expect(replyBox).toBeVisible({ timeout: 20_000 });
  await replyBox.fill(replyText);
  const [messagesResponse] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/messages") && r.request().method() === "POST"),
    page.getByRole("button", { name: "إرسال الرد" }).click(),
  ]);
  expect(messagesResponse.ok()).toBeTruthy();
  await expect(page.getByText(replyText)).toBeVisible({ timeout: 20_000 });

  await page.goto(`/admin/order-tickets/${ticketId}`);
  await expect(page.getByText(replyText)).toBeVisible({ timeout: 20_000 });

  // 9.3 rework #2 — the reply is also an admin write on the order (rule B1).
  const replyAudit = await prisma.adminAuditLog.findFirst({
    where: { entityId: filterOrderId, action: "ticket_reply" },
    orderBy: { createdAt: "desc" },
  });
  expect(replyAudit).toBeTruthy();

  await page.getByRole("button", { name: "إغلاق السؤال" }).click();
  await expect(page.getByText("مغلقة")).toBeVisible({ timeout: 20_000 });
  const closeAudit = await prisma.adminAuditLog.findFirst({
    where: { entityId: filterOrderId, action: "ticket_close" },
    orderBy: { createdAt: "desc" },
  });
  expect(closeAudit).toBeTruthy();
});

const SCREENSHOT_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1514, height: 681 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

test("screenshots: list and detail at the four viewports", async ({ page }) => {
  await loginAsAdmin(page);
  for (const { width, height } of SCREENSHOT_VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/admin/orders?"), { timeout: 20_000 }),
      page.goto("/admin/orders"),
    ]);
    await expect(page.getByRole("heading", { name: "الطلبات", exact: true })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/admin-v2-orders-list-${width}x${height}.png`, fullPage: true });

    await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/api/admin/orders/${filterOrderId}`), { timeout: 20_000 }),
      page.goto(`/admin/orders/${filterOrderId}`),
    ]);
    await expect(page.getByText("الشريك المنفّذ")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/admin-v2-orders-detail-${width}x${height}.png`, fullPage: true });
  }
});

test("bulk assign two orders reports a per-order results line", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/orders?stage=UNASSIGNED");
  await expect(page.locator(`table [data-row-id="${bulkOrderId1}"]`)).toBeVisible({ timeout: 20_000 });

  await page.locator(`[data-row-id="${bulkOrderId1}"] input[type="checkbox"]`).check();
  await page.locator(`[data-row-id="${bulkOrderId2}"] input[type="checkbox"]`).check();
  await page.getByRole("button", { name: "إسناد إلى شريك" }).click();
  await page.getByRole("dialog").getByLabel("الشريك").selectOption(pair.agent.partnerId);
  await page.getByRole("button", { name: "تأكيد الإسناد" }).click();
  await expect(page.getByText(/أُسند 2/).first()).toBeVisible({ timeout: 20_000 });

  const o1 = await prisma.order.findUniqueOrThrow({ where: { id: bulkOrderId1 } });
  const o2 = await prisma.order.findUniqueOrThrow({ where: { id: bulkOrderId2 } });
  expect(o1.assignedPartnerId).toBe(pair.agent.partnerId);
  expect(o2.assignedPartnerId).toBe(pair.agent.partnerId);
});

test("/admin/routed-orders and its detail redirect to their new homes", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/routed-orders?status=UNROUTED");
  await expect(page).toHaveURL(/\/admin\/orders\?stage=UNASSIGNED/, { timeout: 20_000 });

  await page.goto(`/admin/routed-orders/${routedOrderIdForRedirect}`);
  await expect(page).toHaveURL(`/admin/orders/${filterOrderId}`, { timeout: 20_000 });
});

test("401 signed-out, 403 for a customer on the new routes", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(CUSTOMER_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill("AdminOrdersCust123!");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
  const res = await page.request.post(`/api/admin/orders/${filterOrderId}/assign`, { data: { partnerId: pair.agent.partnerId } });
  expect(res.status()).toBe(403);

  const context = await browser.newContext();
  const guestPage = await context.newPage();
  const guestRes = await guestPage.request.post(`/api/admin/orders/${filterOrderId}/assign`, { data: { partnerId: pair.agent.partnerId } });
  expect(guestRes.status()).toBe(401);
  await context.close();
});

test("at 390×844 the list cards and the single-column detail render with no overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);

  await page.goto("/admin/orders");
  await expect(page.getByRole("heading", { name: "الطلبات", exact: true })).toBeVisible({ timeout: 20_000 });
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);

  await page.goto(`/admin/orders/${filterOrderId}`);
  await expect(page.getByText("الشريك المنفّذ")).toBeVisible({ timeout: 20_000 });
  overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);
});
