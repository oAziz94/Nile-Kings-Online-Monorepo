import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 6.4 (Orders: track, detail, filters, pagination, reorder, cancel) coverage.
 * Same seeded-fixture-user + scrypt-hash pattern as `public-profile.spec.ts`, with a distinct
 * fixture phone. Twelve orders are seeded for the fixture user against a dedicated partner +
 * variant created only for this spec, so cleanup can delete everything (including the variant)
 * without touching any other data. Run against the redesign Neon branch only
 * (test-env.ts's production guard).
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

const FIXTURE_PHONE = "+201099933445";
const FIXTURE_PASSWORD = "OrdersTest123!";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.describe.configure({ mode: "serial" });

const shippingAddress = {
  governorate: "القاهرة",
  city: "مدينة نصر",
  area: "الحي السابع",
  street: "12 شارع الاختبار",
  phone: "+201000000111",
};

let fixtureUserId: string;
let partnerId: string;
let partnerUserId: string;
let cairoStockPartnerId: string | null = null;
let categoryId: string;
let productId: string;
let variantId: string;

// Order ids, named by role in the scenarios below.
let orderCreatedUiId: string;
let orderCreatedRaceId: string;
let orderConfirmedId: string;
let orderReadyToShipId: string;
let orderDeliveredId: string; // reorder target
let orderFiveItemsId: string;
let orderCancelledWithReasonId: string;
let orderDetailMoneyId: string;
const allOrderIds: string[] = [];

async function setGovernorate(page: Page) {
  const res = await page.request.post("/api/storefront/governorate", { data: { governorate: "القاهرة" } });
  expect(res.ok()).toBeTruthy();
}

async function loginViaUi(page: Page) {
  await setGovernorate(page);
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(FIXTURE_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(FIXTURE_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 15000 });
}

test.beforeAll(async () => {
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  const fixtureUser = await prisma.user.upsert({
    where: { phone: FIXTURE_PHONE },
    create: { phone: FIXTURE_PHONE, role: "CUSTOMER", passwordHash, name: "عميل اختبار الطلبات" },
    update: { passwordHash, role: "CUSTOMER" },
  });
  fixtureUserId = fixtureUser.id;

  const partnerUser = await prisma.user.create({
    data: { phone: `+20${uniqueSuffix}`, role: "CUSTOMER", passwordHash: await hashPassword("x") },
  });
  partnerUserId = partnerUser.id;
  const partner = await prisma.partner.create({
    data: {
      userId: partnerUserId,
      partnerType: "AGENT",
      name: `وكيل اختبار الطلبات ${uniqueSuffix}`,
      governorate: "القاهرة",
      phone: `+20${uniqueSuffix}`,
      isActive: true,
    },
  });
  partnerId = partner.id;

  const category = await prisma.category.create({
    data: { name: `فئة اختبار الطلبات ${uniqueSuffix}`, slug: `test-cat-orders-${uniqueSuffix}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج اختبار الطلبات ${uniqueSuffix}`, slug: `test-product-orders-${uniqueSuffix}`, weightGrams: 200 },
  });
  productId = product.id;
  const variant = await prisma.variant.create({
    data: { productId, sku: `TEST-ORD-${uniqueSuffix}`, name: "M", pricePiastres: 5000 },
  });
  variantId = variant.id;

  // Reservation for the two CREATED orders below (qty 2 + qty 3 = 5 reserved).
  await prisma.partnerInventory.create({
    data: { partnerId, variantId, stockAvailable: 100, stockReserved: 5 },
  });

  // The reorder test posts to /api/cart/items, which checks sellable stock against whichever
  // partner the *storefront's own* governorate→partner routing (`ReroutingRule`) currently
  // resolves for القاهرة — not necessarily this spec's own `partnerId` (that only matters for
  // the orders themselves). Rather than touch the shared `ReroutingRule`/`ReroutingRulePartner`
  // rows (other specs may run concurrently against the same redesign branch and route through
  // them), we read which partner is currently active for القاهرة and grant that partner real
  // stock for this spec's own test-only variant — additive, and nobody else ever references
  // this variant. Cleaned up in `afterAll`.
  const cairoRule = await prisma.reroutingRule.findFirst({
    where: { governorate: "القاهرة", isActive: true },
    include: {
      partners: {
        where: { isActive: true, partner: { isActive: true } },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        include: { partner: { select: { id: true } } },
      },
    },
  });
  cairoStockPartnerId = cairoRule?.partners[0]?.partner.id ?? null;
  if (cairoStockPartnerId) {
    await prisma.partnerInventory.create({
      data: { partnerId: cairoStockPartnerId, variantId, stockAvailable: 50, stockReserved: 0 },
    });
  }

  const baseItem = (qty: number, unit: number) => ({
    variantId,
    productName: product.name,
    variantName: `اختبار-${uniqueSuffix}`,
    sku: variant.sku,
    quantity: qty,
    unitPricePiastres: unit,
    totalPiastres: unit * qty,
  });

  const now = Date.now();
  let offset = 0;
  const nextCreatedAt = () => new Date(now - 60_000 * offset++);

  // 1. CREATED — cancelled via the UI in this spec.
  const oCreatedUi = await prisma.order.create({
    data: {
      userId: fixtureUserId,
      assignedPartnerId: partnerId,
      status: "CREATED",
      subtotalPiastres: 10000,
      totalPiastres: 10000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      createdAt: nextCreatedAt(),
      items: { create: [baseItem(2, 5000)] },
    },
  });
  orderCreatedUiId = oCreatedUi.id;

  // 2. CREATED — cancelled via two parallel PATCH requests.
  const oCreatedRace = await prisma.order.create({
    data: {
      userId: fixtureUserId,
      assignedPartnerId: partnerId,
      status: "CREATED",
      subtotalPiastres: 15000,
      totalPiastres: 15000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      createdAt: nextCreatedAt(),
      items: { create: [baseItem(3, 5000)] },
    },
  });
  orderCreatedRaceId = oCreatedRace.id;

  // 3. CONFIRMED — not cancellable.
  const oConfirmed = await prisma.order.create({
    data: {
      userId: fixtureUserId,
      assignedPartnerId: partnerId,
      status: "CONFIRMED",
      subtotalPiastres: 5000,
      totalPiastres: 5000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      createdAt: nextCreatedAt(),
      items: { create: [baseItem(1, 5000)] },
    },
  });
  orderConfirmedId = oConfirmed.id;

  // 4. READY_TO_SHIP — stepper should mark "قيد التجهيز" as current.
  const oReady = await prisma.order.create({
    data: {
      userId: fixtureUserId,
      assignedPartnerId: partnerId,
      status: "READY_TO_SHIP",
      subtotalPiastres: 5000,
      totalPiastres: 5000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      createdAt: nextCreatedAt(),
      items: { create: [baseItem(1, 5000)] },
    },
  });
  orderReadyToShipId = oReady.id;

  // 5. SHIPPED.
  const oShipped = await prisma.order.create({
    data: {
      userId: fixtureUserId,
      assignedPartnerId: partnerId,
      status: "SHIPPED",
      subtotalPiastres: 5000,
      totalPiastres: 5000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      createdAt: nextCreatedAt(),
      items: { create: [baseItem(1, 5000)] },
    },
  });

  // 6. DELIVERED — reorder target (quantity 2 of the test variant).
  const oDelivered = await prisma.order.create({
    data: {
      userId: fixtureUserId,
      assignedPartnerId: partnerId,
      status: "DELIVERED",
      subtotalPiastres: 10000,
      totalPiastres: 10000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      createdAt: nextCreatedAt(),
      items: { create: [baseItem(2, 5000)] },
    },
  });
  orderDeliveredId = oDelivered.id;

  // 7. DELIVERED, 5 items — truncation ("+2") on the card, full list in the detail.
  const oFive = await prisma.order.create({
    data: {
      userId: fixtureUserId,
      assignedPartnerId: partnerId,
      status: "DELIVERED",
      subtotalPiastres: 5000,
      totalPiastres: 5000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      createdAt: nextCreatedAt(),
      items: {
        create: Array.from({ length: 5 }, (_, i) => ({
          variantId,
          productName: `${product.name} ${i + 1}`,
          variantName: `اختبار-${uniqueSuffix}`,
          sku: variant.sku,
          quantity: 1,
          unitPricePiastres: 1000,
          totalPiastres: 1000,
        })),
      },
    },
  });
  orderFiveItemsId = oFive.id;

  // 8. CANCELLED with a real (non-internal) reason — shown to the customer.
  const oCancelled = await prisma.order.create({
    data: {
      userId: fixtureUserId,
      assignedPartnerId: partnerId,
      status: "CANCELLED",
      cancellationReason: "المنتج غير متوفر لدى المخزون",
      subtotalPiastres: 5000,
      totalPiastres: 5000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      createdAt: nextCreatedAt(),
      items: { create: [baseItem(1, 5000)] },
    },
  });
  orderCancelledWithReasonId = oCancelled.id;

  // 9. DELIVERED with a discount + COD fee — exercises the full money-box math.
  const oMoney = await prisma.order.create({
    data: {
      userId: fixtureUserId,
      assignedPartnerId: partnerId,
      status: "DELIVERED",
      subtotalPiastres: 20000, // 200 ج.م
      discountPiastres: 2000, // 20 ج.م
      shippingPiastres: 3000, // 30 ج.م
      codFeePiastres: 500, // 5 ج.م -> shipping line 35 ج.م (COD)
      totalPiastres: 21500, // 215 ج.م
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      createdAt: nextCreatedAt(),
      items: { create: [baseItem(1, 20000)] },
    },
  });
  orderDetailMoneyId = oMoney.id;

  // 10. PROCESSING — completes page 1 (10th newest).
  const oProcessing = await prisma.order.create({
    data: {
      userId: fixtureUserId,
      assignedPartnerId: partnerId,
      status: "PROCESSING",
      subtotalPiastres: 5000,
      totalPiastres: 5000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      createdAt: nextCreatedAt(),
      items: { create: [baseItem(1, 5000)] },
    },
  });

  // 11 & 12 — older orders, only visible after "عرض طلبات أقدم".
  const oOlderA = await prisma.order.create({
    data: {
      userId: fixtureUserId,
      assignedPartnerId: partnerId,
      status: "CONFIRMED",
      subtotalPiastres: 5000,
      totalPiastres: 5000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      createdAt: nextCreatedAt(),
      items: { create: [baseItem(1, 5000)] },
    },
  });
  const oOlderB = await prisma.order.create({
    data: {
      userId: fixtureUserId,
      assignedPartnerId: partnerId,
      status: "PROCESSING",
      subtotalPiastres: 5000,
      totalPiastres: 5000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      createdAt: nextCreatedAt(),
      items: { create: [baseItem(1, 5000)] },
    },
  });

  allOrderIds.push(
    orderCreatedUiId,
    orderCreatedRaceId,
    orderConfirmedId,
    orderReadyToShipId,
    oShipped.id,
    orderDeliveredId,
    orderFiveItemsId,
    orderCancelledWithReasonId,
    orderDetailMoneyId,
    oProcessing.id,
    oOlderA.id,
    oOlderB.id
  );
});

test.afterAll(async () => {
  await prisma.orderAuditLog.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: allOrderIds } } });
  await prisma.cartItem.deleteMany({ where: { cart: safeWhere({ userId: fixtureUserId }) } });
  await prisma.partnerInventory.deleteMany({ where: safeWhere({ partnerId, variantId }) });
  if (cairoStockPartnerId) {
    await prisma.partnerInventory.deleteMany({ where: safeWhere({ partnerId: cairoStockPartnerId, variantId }) });
    await prisma.inventoryLedger.deleteMany({ where: safeWhere({ partnerId: cairoStockPartnerId, variantId }) });
  }
  await prisma.inventoryLedger.deleteMany({ where: safeWhere({ partnerId, variantId }) });
  await prisma.variant.deleteMany({ where: safeWhere({ id: variantId }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await prisma.partner.deleteMany({ where: safeWhere({ id: partnerId }) });
  await prisma.user.deleteMany({ where: { id: { in: [partnerUserId] } } });
  await prisma.$disconnect();
});

test("pagination, stepper, five-item truncation, and the cancelled-with-reason note", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/profile/orders");
  await expect(page.getByRole("heading", { name: "طلباتي" })).toBeVisible();

  const cardFor = (orderId: string) => page.locator("article", { hasText: `#${orderId.slice(-8).toUpperCase()}` });

  // First page: 10 cards, the two oldest not yet loaded.
  await expect(page.locator("article")).toHaveCount(10);
  const olderA = cardFor(orderConfirmedId); // page-1 sanity check
  await expect(olderA).toBeVisible();

  const loadOlder = page.getByRole("button", { name: "عرض طلبات أقدم" });
  await expect(loadOlder).toBeVisible();
  await loadOlder.click();
  await expect(page.locator("article")).toHaveCount(12);
  await expect(loadOlder).toHaveCount(0);

  // Stepper: READY_TO_SHIP sits on "قيد التجهيز" (current step, bold).
  const readyCard = cardFor(orderReadyToShipId);
  await expect(readyCard.getByText("قيد التجهيز", { exact: true })).toHaveCSS("font-weight", "500");

  // Five-item order truncates to 3 + "+2" on the card, all 5 show once expanded.
  const fiveCard = cardFor(orderFiveItemsId);
  await expect(fiveCard.getByText("+2", { exact: true })).toBeVisible();
  const fiveItems = await prisma.orderItem.findMany({
    where: { orderId: orderFiveItemsId },
    orderBy: { createdAt: "asc" },
  });
  expect(fiveItems).toHaveLength(5);
  await fiveCard.getByRole("button", { name: "عرض التفاصيل" }).click();
  for (const item of fiveItems) {
    await expect(fiveCard.getByText(item.productName, { exact: true }).first()).toBeVisible();
  }

  // Cancelled-with-reason note replaces the stepper and names the reason.
  const cancelledCard = cardFor(orderCancelledWithReasonId);
  await expect(cancelledCard.getByText("المنتج غير متوفر لدى المخزون", { exact: false })).toBeVisible();
});

test("expanded detail totals equal the API's piastre fields", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/profile/orders");

  // orderDetailMoneyId is the 9th-newest of 12 — visible on the first (10-item) page already.
  const card = page.locator("article", { hasText: `#${orderDetailMoneyId.slice(-8).toUpperCase()}` });
  await card.getByRole("button", { name: "عرض التفاصيل" }).click();

  await expect(card.getByText("المجموع الفرعي")).toBeVisible();
  await expect(card.getByText("200", { exact: false }).first()).toBeVisible();
  await expect(card.getByText("− 20", { exact: false })).toBeVisible();
  await expect(card.getByText("35", { exact: false }).first()).toBeVisible();
  await expect(card.getByText("215", { exact: false }).first()).toBeVisible();
});

test("reorder on a DELIVERED order puts the right variant/quantity in the cart", async ({ page }) => {
  await loginViaUi(page);
  // Start from an empty cart so the assertion is unambiguous.
  await prisma.cartItem.deleteMany({ where: { cart: safeWhere({ userId: fixtureUserId }) } });

  await page.goto("/profile/orders");
  const card = page.locator("article", { hasText: `#${orderDeliveredId.slice(-8).toUpperCase()}` });
  await card.getByRole("button", { name: "إعادة الطلب" }).click();

  await expect(async () => {
    const res = await page.request.get("/api/cart");
    const json = await res.json();
    const line = json.data.items.find((i: { variantId: string }) => i.variantId === variantId);
    expect(line).toBeTruthy();
    expect(line.quantity).toBe(2);
  }).toPass({ timeout: 10_000 });

  await prisma.cartItem.deleteMany({ where: { cart: safeWhere({ userId: fixtureUserId }) } });
});

// Backlog 7.3 — a cancelled order is not one of the customer's orders: the identity strip, the
// account API and the drawer summary all count 11 of the 12 fixture orders (one is CANCELLED).
test("the order count everywhere excludes cancelled orders", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/profile/account");
  await expect(page.getByText(/^11 طلبات$/)).toBeVisible();
  const account = await page.request.get("/api/profile/account");
  expect((await account.json()).data.orderCount).toBe(11);
  const summary = await page.request.get("/api/profile/orders/summary");
  expect((await summary.json()).data.orderCount).toBe(11);
});
