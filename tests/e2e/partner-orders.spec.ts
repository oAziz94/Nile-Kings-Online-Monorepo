import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

/**
 * Backlog 4.19 (Partner orders: list with bulk/next-status, order detail) coverage.
 * Serial mode: one seeded fixture pair + two orders shared across the scenarios (mirrors
 * the backlog entry's own scenario list), cleaned up once at the end.
 */
test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
let pair: PartnerFixturePair;
let customerUserId: string;
let categoryId: string;
let productId: string;
let variantAId: string; // plenty of reserved stock -> commits cleanly
let variantBId: string; // reserved < order quantity -> insufficient-stock failure
let orderAId: string;
let orderBId: string;
let routedAId: string;
let routedBId: string;

// Digits only (no underscore) so it's usable both in a phone number and as a plain search string.
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma);

  const customer = await prisma.user.create({
    // Not sliced — the RoutedOrder query only searches orderId/user.phone/user.name (not item
    // names), so the search text used across this spec's `q=` filters must be a substring of
    // this phone number for both the orders list and its routedOrders companion array to match.
    data: { phone: `+20${uniqueSuffix}`, role: "CUSTOMER", name: "عميل الاختبار" },
  });
  customerUserId = customer.id;

  const category = await prisma.category.create({
    data: { name: "فئة اختبار 4.19", slug: `test-cat-${uniqueSuffix}` },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: {
      categoryId,
      name: `منتج اختبار ${uniqueSuffix}`,
      slug: `test-product-${uniqueSuffix}`,
      weightGrams: 200,
    },
  });
  productId = product.id;

  const variantA = await prisma.variant.create({
    data: {
      productId,
      sku: `TEST-A-${uniqueSuffix}`,
      name: "M",
      pricePiastres: 10000,
      stockAvailable: 0,
      stockReserved: 0,
    },
  });
  variantAId = variantA.id;

  const variantB = await prisma.variant.create({
    data: {
      productId,
      sku: `TEST-B-${uniqueSuffix}`,
      name: "L",
      pricePiastres: 15000,
      stockAvailable: 0,
      stockReserved: 0,
    },
  });
  variantBId = variantB.id;

  // Partner inventory: variant A fully reserved for its order's quantity (2) -> commit succeeds.
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: variantAId, stockAvailable: 10, stockReserved: 2 },
  });
  // Variant B: order needs 5, but only 1 is reserved -> commit fails with the insufficient-stock message.
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: variantBId, stockAvailable: 10, stockReserved: 1 },
  });

  const shippingAddress = {
    governorate: "القاهرة",
    city: "مدينة نصر",
    area: "الحي السابع",
    street: "شارع الاختبار",
  };

  const orderA = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "CREATED",
      subtotalPiastres: 20000,
      totalPiastres: 20000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      assignedPartnerId: pair.agent.partnerId,
      items: {
        create: [
          {
            variantId: variantAId,
            productName: product.name,
            variantName: "test-product-variant-a-اسود",
            sku: variantA.sku,
            quantity: 2,
            unitPricePiastres: 10000,
            totalPiastres: 20000,
          },
        ],
      },
    },
  });
  orderAId = orderA.id;

  const orderB = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "CREATED",
      subtotalPiastres: 75000,
      totalPiastres: 75000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      assignedPartnerId: pair.agent.partnerId,
      items: {
        create: [
          {
            variantId: variantBId,
            productName: product.name,
            variantName: "test-product-variant-b-ابيض",
            sku: variantB.sku,
            quantity: 5,
            unitPricePiastres: 15000,
            totalPiastres: 75000,
          },
        ],
      },
    },
  });
  orderBId = orderB.id;

  const routedA = await prisma.routedOrder.create({
    data: { orderId: orderAId, governorate: "القاهرة", partnerId: pair.agent.partnerId, status: "ACCEPTED" },
  });
  routedAId = routedA.id;
  const routedB = await prisma.routedOrder.create({
    data: { orderId: orderBId, governorate: "القاهرة", partnerId: pair.agent.partnerId, status: "ASSIGNED" },
  });
  routedBId = routedB.id;
});

test.afterAll(async () => {
  await prisma.orderAuditLog.deleteMany({ where: { orderId: { in: [orderAId, orderBId] } } });
  await prisma.routedOrder.deleteMany({ where: { id: { in: [routedAId, routedBId] } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: [orderAId, orderBId] } } });
  await prisma.order.deleteMany({ where: { id: { in: [orderAId, orderBId] } } });
  await prisma.inventoryLedger.deleteMany({ where: { variantId: { in: [variantAId, variantBId] } } });
  await prisma.partnerInventory.deleteMany({ where: { variantId: { in: [variantAId, variantBId] } } });
  await prisma.variant.deleteMany({ where: { id: { in: [variantAId, variantBId] } } });
  await prisma.product.delete({ where: { id: productId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await prisma.user.delete({ where: { id: customerUserId } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.$disconnect();
});

test("list shows both the order status pill and the routed-order status pill", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/routed-orders?q=${uniqueSuffix}`);

  const rowA = page.locator(`tr[data-row-id="${orderAId}"]`);
  await expect(rowA).toBeVisible({ timeout: 15_000 });
  await expect(rowA.getByText("قيد الانشاء")).toBeVisible();
  await expect(rowA.getByText("مقبول")).toBeVisible(); // ACCEPTED

  const rowB = page.locator(`tr[data-row-id="${orderBId}"]`);
  await expect(rowB).toBeVisible();
  await expect(rowB.getByText("مُعيَّن")).toBeVisible(); // ASSIGNED
});

test("the URL's comma-separated multi-status filter works even though the dropdown is single-select", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/routed-orders?status=CREATED,CONFIRMED&q=${uniqueSuffix}`);
  // Both seeded orders are CREATED and match the search text embedded in their variant names/sku.
  await expect(page.locator(`tr[data-row-id="${orderAId}"]`)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(`tr[data-row-id="${orderBId}"]`)).toBeVisible({ timeout: 15_000 });

  await page.goto(`/partner/routed-orders?status=DELIVERED&q=${uniqueSuffix}`);
  await expect(page.locator(`tr[data-row-id="${orderAId}"]`)).toHaveCount(0);
  await expect(page.getByText("لا توجد نتائج للبحث")).toBeVisible({ timeout: 15_000 });
});

test("per-row 'الحالة التالية' advances one order and commits its partner stock", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/routed-orders?q=${uniqueSuffix}`);

  const rowA = page.locator(`tr[data-row-id="${orderAId}"]`);
  await rowA.getByRole("button", { name: "مؤكد" }).click(); // CREATED -> CONFIRMED

  await expect(page.getByText("تم تحديث الحالة إلى مؤكد").first()).toBeVisible({ timeout: 15_000 });

  await expect(async () => {
    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderAId } });
    expect(order.status).toBe("CONFIRMED");
  }).toPass({ timeout: 10_000 });

  const inv = await prisma.partnerInventory.findUniqueOrThrow({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: variantAId } },
  });
  expect(inv.stockAvailable).toBe(8); // 10 - 2 committed
  expect(inv.stockReserved).toBe(0); // 2 - 2 committed
});

test("bulk status change moves two orders and reports one failure when one lacks stock", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/routed-orders?q=${uniqueSuffix}`);

  await page.getByRole("checkbox", { name: "تحديد كل الصفوف" }).check();
  await page.getByRole("button", { name: /تغيير حالة المحددة/ }).click();

  await page.getByLabel("الحالة الجديدة").selectOption("CONFIRMED");
  await page.getByRole("button", { name: "تأكيد" }).click();

  // Order A is already CONFIRMED (no-op success); order B is still CREATED and lacks enough
  // reserved stock (needs 5, only 1 reserved) -> the bulk endpoint reports it as a failure
  // without rolling back order A.
  await expect(page.getByText(/تم تحديث 1 · فشل 1/).first()).toBeVisible({ timeout: 15_000 });

  const orderB = await prisma.order.findUniqueOrThrow({ where: { id: orderBId } });
  expect(orderB.status).toBe("CREATED"); // unchanged — the failed transaction didn't apply
  const invB = await prisma.partnerInventory.findUniqueOrThrow({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: variantBId } },
  });
  expect(invB.stockAvailable).toBe(10); // untouched
  expect(invB.stockReserved).toBe(1); // untouched
});

test("distributor gets a 403 panel (not 'not found') opening an order detail URL directly", async ({ page }) => {
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto(`/partner/orders/${orderAId}`);
  await expect(page.getByText("هذا الطلب متاح للوكلاء فقط")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("الطلب غير موجود")).toHaveCount(0);
});

test("exporting a non-READY_TO_SHIP selection shows the exact 400 message", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/routed-orders?q=${uniqueSuffix}`);

  await page.getByRole("checkbox", { name: "تحديد كل الصفوف" }).check();
  await page.getByRole("button", { name: /ملف الشحن/ }).click();

  await expect(page.getByText("لا توجد طلبات بحالة «جاهز للشحن» ضمن الطلبات المحددة").first()).toBeVisible({ timeout: 15_000 });
});

test("order detail notes round-trip", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/orders/${orderAId}`);

  const noteText = `ملاحظة اختبار ${uniqueSuffix}`;
  const textarea = page.getByLabel("ملاحظات");
  await textarea.fill(noteText);
  await page.getByRole("button", { name: "حفظ الملاحظات" }).click();
  await expect(page.getByText("تم حفظ الملاحظات").first()).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByLabel("ملاحظات")).toHaveValue(noteText);

  // Clearing the field sends `adminNotes: null` (the page's `adminNotes.trim() || null`), not
  // `adminNotes: ""` — a pre-existing quirk of the legacy PATCH handler's
  // `body.adminNotes === "" ? null : String(body.adminNotes).trim()` line (preserved
  // byte-for-byte by the 4.19 extraction, not introduced by it): a JS `null` payload takes the
  // `else` branch and is stringified to the literal text "null" rather than a real SQL NULL.
  // This assertion documents that preserved behaviour rather than "fixing" it without PM sign-off.
  await page.getByLabel("ملاحظات").fill("");
  await page.getByRole("button", { name: "حفظ الملاحظات" }).click();
  await expect(page.getByText("تم حفظ الملاحظات").first()).toBeVisible({ timeout: 15_000 });

  const order = await prisma.order.findUniqueOrThrow({ where: { id: orderAId } });
  expect(order.adminNotes).toBe("null");
});

test("'رجوع للطلبات' is a real link back to the orders list", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/orders/${orderAId}`);
  await page.getByRole("link", { name: "رجوع للطلبات" }).click();
  await page.waitForURL("**/partner/routed-orders*");
  expect(new URL(page.url()).pathname).toBe("/partner/routed-orders");
});
