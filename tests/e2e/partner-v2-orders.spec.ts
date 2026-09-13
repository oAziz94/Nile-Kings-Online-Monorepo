import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

/**
 * Backlog 5.3 (الطلبات pipeline + detail) coverage. Replaces `partner-orders.spec.ts`
 * (deleted — v1's `/partner/routed-orders` list and `/partner/orders/[id]` detail are now
 * one v2 surface at `/partner/orders`). Serial mode: one seeded fixture pair with a short
 * `confirmSlaHours` (so the overdue rule is deterministic without waiting real time) and a
 * handful of orders shared across scenarios, cleaned up once at the end.
 */
test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
let pair: PartnerFixturePair;
let customerUserId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let orderOverdueId: string; // CREATED, backdated past the 1h confirmSlaHours -> overdue
let orderFreshId: string; // CREATED, just now -> not overdue
let orderBulkAId: string;
let orderBulkBId: string;
let orderBulkCId: string;
let orderConfirmedId: string; // pre-CONFIRMED, for the tab filter test
let foreignOrderId: string; // assigned to the distributor side -> 403 on the pick list

const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma, { agent: { confirmSlaHours: 1, shipSlaHours: 48 } });

  const customer = await prisma.user.create({
    data: { phone: `+20${uniqueSuffix}`, role: "CUSTOMER", name: `عميل اختبار ${uniqueSuffix}` },
  });
  customerUserId = customer.id;

  const category = await prisma.category.create({
    data: { name: `فئة اختبار 5.3 ${uniqueSuffix}`, slug: `test-cat-5-3-${uniqueSuffix}` },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: { categoryId, name: `منتج اختبار ${uniqueSuffix}`, slug: `test-product-5-3-${uniqueSuffix}`, weightGrams: 200 },
  });
  productId = product.id;

  const variant = await prisma.variant.create({
    data: { productId, sku: `TEST-5-3-${uniqueSuffix}`, name: "M", pricePiastres: 10000, stockAvailable: 0, stockReserved: 0 },
  });
  variantId = variant.id;

  // Plenty of reserved stock so every status transition in this spec commits cleanly.
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId, stockAvailable: 100, stockReserved: 20 },
  });

  const shippingAddress = { governorate: "القاهرة", city: "مدينة نصر", area: "الحي السابع", street: "شارع الاختبار", phone: "+201000000000" };

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
          variantName: `test-product-variant-${uniqueSuffix}-اسود`,
          sku: variant.sku,
          quantity: 1,
          unitPricePiastres: 10000,
          totalPiastres: 10000,
        },
      ],
    },
  };

  const twoHoursAgo = new Date(Date.now() - 2 * 3_600_000);

  const overdueOrder = await prisma.order.create({
    data: { ...baseOrder, status: "CREATED", createdAt: twoHoursAgo },
  });
  orderOverdueId = overdueOrder.id;

  const freshOrder = await prisma.order.create({ data: { ...baseOrder, status: "CREATED" } });
  orderFreshId = freshOrder.id;

  const bulkA = await prisma.order.create({ data: { ...baseOrder, status: "CREATED" } });
  orderBulkAId = bulkA.id;
  const bulkB = await prisma.order.create({ data: { ...baseOrder, status: "CREATED" } });
  orderBulkBId = bulkB.id;
  const bulkC = await prisma.order.create({ data: { ...baseOrder, status: "CREATED" } });
  orderBulkCId = bulkC.id;

  const confirmedOrder = await prisma.order.create({ data: { ...baseOrder, status: "CONFIRMED" } });
  orderConfirmedId = confirmedOrder.id;
  await prisma.orderAuditLog.create({
    data: { orderId: confirmedOrder.id, event: "confirmed", statusFrom: "CREATED", statusTo: "CONFIRMED" },
  });

  const foreignOrder = await prisma.order.create({
    data: { ...baseOrder, status: "CREATED", assignedPartnerId: pair.distributor.partnerId },
  });
  foreignOrderId = foreignOrder.id;
});

test.afterAll(async () => {
  const orderIds = [
    orderOverdueId,
    orderFreshId,
    orderBulkAId,
    orderBulkBId,
    orderBulkCId,
    orderConfirmedId,
    foreignOrderId,
  ];
  await prisma.orderAuditLog.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.inventoryLedger.deleteMany({ where: { variantId } });
  await prisma.partnerInventory.deleteMany({ where: { variantId } });
  await prisma.variant.delete({ where: { id: variantId } });
  await prisma.product.delete({ where: { id: productId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.user.delete({ where: { id: customerUserId } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.$disconnect();
});

test("stage tabs filter and round-trip through the URL", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/orders?q=${uniqueSuffix}`);

  await expect(page.locator(`tr[data-row-id="${orderConfirmedId}"]`)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(`tr[data-row-id="${orderFreshId}"]`)).toBeVisible();

  await page.getByRole("tablist", { name: "مراحل الطلبات" }).getByRole("tab", { name: /^مؤكد/ }).click();
  await expect(page).toHaveURL(/status=CONFIRMED/);
  await expect(page.locator(`tr[data-row-id="${orderConfirmedId}"]`)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(`tr[data-row-id="${orderFreshId}"]`)).toHaveCount(0);

  // Reload from the URL directly — the filter survives navigation, not just client state.
  await page.reload();
  await expect(page.locator(`tr[data-row-id="${orderConfirmedId}"]`)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(`tr[data-row-id="${orderFreshId}"]`)).toHaveCount(0);
});

test("overdue filter follows the partner's confirmSlaHours, not a hard-coded 24h", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/orders?q=${uniqueSuffix}&status=CREATED`);

  await expect(page.locator(`tr[data-row-id="${orderOverdueId}"]`)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(`tr[data-row-id="${orderOverdueId}"]`).getByText("متأخرة")).toBeVisible();
  await expect(page.locator(`tr[data-row-id="${orderFreshId}"]`).getByText("متأخرة")).toHaveCount(0);

  await page.getByRole("button", { name: "متأخرة فقط" }).click();
  await expect(page).toHaveURL(/overdue=1/);
  await expect(page.locator(`tr[data-row-id="${orderOverdueId}"]`)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(`tr[data-row-id="${orderFreshId}"]`)).toHaveCount(0);
});

test("bulk status change of three orders moves them all and writes audit rows", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/orders?q=${uniqueSuffix}&status=CREATED`);

  for (const id of [orderBulkAId, orderBulkBId, orderBulkCId]) {
    await page.locator(`tr[data-row-id="${id}"]`).getByRole("checkbox", { name: "تحديد الصف" }).check();
  }
  await page.getByRole("button", { name: /تغيير الحالة \(3\)/ }).click();
  await page.getByLabel("الحالة الجديدة").selectOption("CONFIRMED");
  await page.getByRole("button", { name: "تأكيد" }).click();

  await expect(page.getByText(/تم تحديث 3 طلبات/).first()).toBeVisible({ timeout: 15_000 });

  await expect(async () => {
    const orders = await prisma.order.findMany({
      where: { id: { in: [orderBulkAId, orderBulkBId, orderBulkCId] } },
    });
    expect(orders.every((o) => o.status === "CONFIRMED")).toBe(true);
  }).toPass({ timeout: 10_000 });

  const auditRows = await prisma.orderAuditLog.findMany({
    where: { orderId: { in: [orderBulkAId, orderBulkBId, orderBulkCId] }, event: "confirmed" },
  });
  expect(auditRows).toHaveLength(3);
});

test("two parallel next-status requests on one order: exactly one applies, one audit row", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  const variant = await prisma.variant.findUniqueOrThrow({ where: { id: variantId }, include: { product: true } });
  const order = await prisma.order.create({
    data: {
      userId: customerUserId,
      subtotalPiastres: 10000,
      totalPiastres: 10000,
      shippingAddress: { governorate: "القاهرة", city: "مدينة نصر", area: "الحي السابع", street: "شارع الاختبار", phone: "+201000000000" },
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      assignedPartnerId: pair.agent.partnerId,
      status: "CREATED",
      items: {
        create: [
          {
            variantId,
            productName: variant.product.name,
            variantName: `parallel-${uniqueSuffix}`,
            sku: variant.sku,
            quantity: 1,
            unitPricePiastres: 10000,
            totalPiastres: 10000,
          },
        ],
      },
    },
  });
  try {
    const responses = await Promise.all([
      page.request.patch(`/api/partner/orders/${order.id}`, { data: { status: "CONFIRMED" } }),
      page.request.patch(`/api/partner/orders/${order.id}`, { data: { status: "CONFIRMED" } }),
    ]);
    const okCount = responses.filter((r) => r.ok()).length;
    expect(okCount).toBe(1);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("CONFIRMED");
    const auditRows = await prisma.orderAuditLog.findMany({ where: { orderId: order.id, event: "confirmed" } });
    expect(auditRows).toHaveLength(1);
  } finally {
    await prisma.orderAuditLog.deleteMany({ where: { orderId: order.id } });
    await prisma.orderItem.deleteMany({ where: { orderId: order.id } });
    await prisma.order.delete({ where: { id: order.id } });
  }
});

test("order detail timeline shows the seeded transitions and the routing status pill is gone", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/orders/${orderConfirmedId}`);

  await expect(page.getByText("سجل الطلب")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("أكّدته أنت")).toBeVisible();
  // No `RoutedOrder` status vocabulary anywhere on the detail screen (backlog 5.3: "routing
  // status removed from the table and detail").
  await expect(page.getByText("مُعيَّن")).toHaveCount(0);
  await expect(page.getByText("خارج للتوصيل")).toHaveCount(0);
});

test("pick list renders only the partner's own orders and refuses a foreign id", async ({ page }) => {
  await loginAs(page, pair, "AGENT");

  await page.goto(`/partner/orders/pick-list?ids=${orderFreshId}`);
  await expect(page.getByText(`#${orderFreshId.slice(0, 8)}`)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("test-product-variant", { exact: false })).toBeVisible();

  await page.goto(`/partner/orders/pick-list?ids=${orderFreshId},${foreignOrderId}`);
  await expect(page.getByText("غير مصرح")).toBeVisible({ timeout: 15_000 });
});

test("distributor gets a 403 panel opening an order detail URL directly", async ({ page }) => {
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto(`/partner/orders/${orderFreshId}`);
  await expect(page.getByText("هذا الطلب متاح للوكلاء فقط")).toBeVisible({ timeout: 15_000 });
});

test("order detail notes round-trip", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/orders/${orderFreshId}`);

  const noteText = `ملاحظة اختبار ${uniqueSuffix}`;
  const textarea = page.getByLabel("ملاحظات");
  await textarea.fill(noteText);
  await page.getByRole("button", { name: "حفظ الملاحظات" }).click();
  await expect(page.getByText("تم حفظ الملاحظات").first()).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByLabel("ملاحظات")).toHaveValue(noteText);
});

test("390×844: the pipeline renders card rows, not a table", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/orders?q=${uniqueSuffix}&status=CREATED`);

  await expect(page.locator(`div[data-row-id="${orderFreshId}"]`)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("table")).toBeHidden();
});
