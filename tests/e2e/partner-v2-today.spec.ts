import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

/**
 * Backlog 5.2 (اليوم home) coverage. Serial mode: one seeded fixture pair (AGENT with a
 * short `confirmSlaHours` so one seeded order is overdue on arrival) + a handful of orders
 * covering every queue group, plus one low-stock inventory row, cleaned up once at the end.
 */
test.describe.configure({ mode: "serial" });
// Cold Turbopack compiles + Neon round-trips (same rationale as 4.20's restock spec).
test.setTimeout(90_000);

const prisma = new PrismaClient();
let pair: PartnerFixturePair;
let customerUserId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let lowStockVariantId: string;

let orderCreatedId: string;
let orderOverdueId: string;
let orderConfirmedFreshId: string;
let orderReadyId: string;
const allOrderIds: string[] = [];

const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.beforeAll(async () => {
  // Short shipSlaHours (5h) and long confirmSlaHours (50h) so a 10h-old CONFIRMED order is
  // overdue while a 1h-old one is not; a small capacity so the meter has a non-zero "used".
  pair = await seedPartnerPair(prisma, {
    agent: { confirmSlaHours: 50, shipSlaHours: 5, dailyOrderCapacity: 10, lowStockThreshold: 5 },
  });

  const customer = await prisma.user.create({
    data: { phone: `+20${uniqueSuffix}`, role: "CUSTOMER", name: `عميل اليوم ${uniqueSuffix}` },
  });
  customerUserId = customer.id;

  const category = await prisma.category.create({
    data: { name: `فئة اليوم ${uniqueSuffix}`, slug: `today-cat-${uniqueSuffix}` },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: { categoryId, name: `منتج اليوم ${uniqueSuffix}`, slug: `today-product-${uniqueSuffix}`, active: true },
  });
  productId = product.id;

  const variant = await prisma.variant.create({
    data: { productId, sku: `TODAY-A-${uniqueSuffix}`, name: "M", pricePiastres: 10000, stockAvailable: 0, stockReserved: 0 },
  });
  variantId = variant.id;
  // The CREATED order transitions through the real confirm path (backlog 5.2's "row actions
  // call the existing transition endpoint"), which commits the partner's stock reservation —
  // needs a `PartnerInventory` row with enough `stockReserved` to cover it.
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId, stockAvailable: 20, stockReserved: 4 },
  });

  const lowStockVariant = await prisma.variant.create({
    data: { productId, sku: `TODAY-B-${uniqueSuffix}`, name: "L", pricePiastres: 10000, stockAvailable: 2, stockReserved: 0 },
  });
  lowStockVariantId = lowStockVariant.id;
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: lowStockVariantId, stockAvailable: 2, stockReserved: 0 },
  });

  const shippingAddress = { governorate: "القاهرة", city: "مدينة نصر", area: "الحي السابع", street: "شارع الاختبار" };
  const baseOrder = {
    userId: customerUserId,
    subtotalPiastres: 10000,
    totalPiastres: 10000,
    shippingAddress,
    shippingProvider: "Egypt Post",
    paymentMethod: "COD",
    assignedPartnerId: pair.agent.partnerId,
    items: {
      create: [
        {
          variantId,
          productName: product.name,
          variantName: "M",
          sku: variant.sku,
          quantity: 1,
          unitPricePiastres: 10000,
          totalPiastres: 10000,
        },
      ],
    },
  };

  const now = Date.now();

  const orderCreated = await prisma.order.create({ data: { ...baseOrder, status: "CREATED" } });
  orderCreatedId = orderCreated.id;

  const orderOverdue = await prisma.order.create({ data: { ...baseOrder, status: "CONFIRMED" } });
  orderOverdueId = orderOverdue.id;
  await prisma.orderAuditLog.create({
    data: {
      orderId: orderOverdueId,
      event: "confirmed",
      statusFrom: "CREATED",
      statusTo: "CONFIRMED",
      createdAt: new Date(now - 10 * 60 * 60 * 1000), // 10h ago > 5h shipSlaHours -> overdue
    },
  });

  const orderConfirmedFresh = await prisma.order.create({ data: { ...baseOrder, status: "CONFIRMED" } });
  orderConfirmedFreshId = orderConfirmedFresh.id;
  await prisma.orderAuditLog.create({
    data: {
      orderId: orderConfirmedFreshId,
      event: "confirmed",
      statusFrom: "CREATED",
      statusTo: "CONFIRMED",
      createdAt: new Date(now - 1 * 60 * 60 * 1000), // 1h ago < 5h shipSlaHours -> not overdue
    },
  });

  const orderReady = await prisma.order.create({ data: { ...baseOrder, status: "READY_TO_SHIP" } });
  orderReadyId = orderReady.id;
  await prisma.orderAuditLog.create({
    data: {
      orderId: orderReadyId,
      event: "status_change",
      statusFrom: "PROCESSING",
      statusTo: "READY_TO_SHIP",
      createdAt: new Date(now - 2 * 60 * 60 * 1000),
    },
  });

  allOrderIds.push(orderCreatedId, orderOverdueId, orderConfirmedFreshId, orderReadyId);
});

test.afterAll(async () => {
  await prisma.orderAuditLog.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: allOrderIds } } });
  await prisma.inventoryLedger.deleteMany({ where: { variantId: { in: [variantId, lowStockVariantId] } } });
  await prisma.partnerInventory.deleteMany({ where: { variantId: { in: [variantId, lowStockVariantId] } } });
  await prisma.variant.deleteMany({ where: { id: { in: [variantId, lowStockVariantId] } } });
  await prisma.product.delete({ where: { id: productId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.user.delete({ where: { id: customerUserId } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.$disconnect();
});

test("every KPI and queue-group count equals the API", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner");
  await expect(page.getByRole("heading", { name: "اليوم" })).toBeVisible();

  const apiRes = await page.request.get("/api/partner/today");
  expect(apiRes.ok()).toBe(true);
  const apiData = (await apiRes.json()).data;

  await expect(page.getByTestId("kpi-orders-today")).toContainText(String(apiData.kpis.ordersToday));
  await expect(page.getByTestId("kpi-overdue")).toContainText(String(apiData.kpis.overdueCount));
  expect(apiData.kpis.overdueCount).toBeGreaterThanOrEqual(1);

  await expect(page.getByTestId("queue-group-to-confirm-count")).toContainText(String(apiData.queue.toConfirm.count));
  await expect(page.getByTestId("queue-group-overdue-count")).toContainText(String(apiData.queue.overdue.count));
  await expect(page.getByTestId("queue-group-ready-to-ship-count")).toContainText(String(apiData.queue.readyToShip.count));
  await expect(page.getByTestId("queue-group-confirmed-count")).toContainText(String(apiData.queue.confirmed.count));
  await expect(page.getByTestId("queue-group-low-stock-count")).toContainText(String(apiData.queue.lowStock.count));

  await expect(page.getByTestId(`queue-row-${orderOverdueId}`)).toBeVisible();
  await expect(page.getByTestId(`queue-row-${orderConfirmedFreshId}`)).toBeVisible();
  await expect(page.getByTestId(`queue-row-${orderReadyId}`)).toBeVisible();
  await expect(page.getByTestId(`queue-row-${orderCreatedId}`)).toBeVisible();
});

test("the overdue rule follows a changed shipSlaHours", async ({ page }) => {
  // Backlog 9.4a (c) — confirmSlaHours/shipSlaHours moved to admin-only ownership
  // (`06-admin-v2.md` §8, approved 2026-09-13); `PATCH /api/partner/settings` no longer
  // accepts either field (400 "المهل يحددها المصنع"). This test is about the overdue rule
  // reacting to a changed `shipSlaHours`, not about the settings PATCH itself, so the SLA
  // change here goes straight through Prisma (the admin PATCH route + its Zod bounds are
  // covered by `admin-v2-partners.spec.ts`).
  await loginAs(page, pair, "AGENT");

  // Raising shipSlaHours past 10h should un-overdue orderOverdueId.
  await prisma.partner.update({ where: { id: pair.agent.partnerId }, data: { shipSlaHours: 20 } });

  await expect
    .poll(async () => {
      const res = await page.request.get("/api/partner/today");
      const json = await res.json();
      return (json.data.queue.overdue.rows as { id: string }[]).some((r) => r.id === orderOverdueId);
    })
    .toBe(false);

  // Restore for the remaining tests.
  await prisma.partner.update({ where: { id: pair.agent.partnerId }, data: { shipSlaHours: 5 } });
  await expect
    .poll(async () => {
      const res = await page.request.get("/api/partner/today");
      const json = await res.json();
      return (json.data.queue.overdue.rows as { id: string }[]).some((r) => r.id === orderOverdueId);
    })
    .toBe(true);
});

test("confirming from the queue moves the order and its group count", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner");

  const row = page.getByTestId(`queue-row-${orderCreatedId}`);
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "تأكيد" }).click();

  await expect(page.getByText("تم تأكيد الطلب").first()).toBeVisible({ timeout: 15_000 });

  await expect(async () => {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderCreatedId } });
    expect(order.status).toBe("CONFIRMED");
  }).toPass({ timeout: 10_000 });

  // The row leaves "بانتظار التأكيد" (invalidated + refetched) — it now shows up in "مؤكدة
  // للتجهيز" instead (freshly CONFIRMED, not yet overdue), same order id, different group.
  await expect(
    page.getByTestId("queue-group-to-confirm").getByTestId(`queue-row-${orderCreatedId}`)
  ).toHaveCount(0, { timeout: 15_000 });
  await expect(
    page.getByTestId("queue-group-confirmed").getByTestId(`queue-row-${orderCreatedId}`)
  ).toBeVisible({ timeout: 15_000 });
});

test("the capacity meter reads n/N and hides when capacity is null", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner");

  const meter = page.getByTestId("capacity-meter");
  await expect(meter).toBeVisible();
  await expect(meter).toContainText("/");
  await expect(meter).toContainText("10");

  const patchRes = await page.request.patch("/api/partner/settings", { data: { dailyOrderCapacity: null } });
  expect(patchRes.ok()).toBe(true);

  await page.reload();
  await expect(page.getByTestId("capacity-meter")).toHaveCount(0);

  // Restore.
  await page.request.patch("/api/partner/settings", { data: { dailyOrderCapacity: 10 } });
});

test("390px layout renders without horizontal overflow", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/partner");

  await expect(page.getByRole("heading", { name: "اليوم" })).toBeVisible();
  await expect(page.getByTestId("kpi-orders-today")).toBeVisible();

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
});
