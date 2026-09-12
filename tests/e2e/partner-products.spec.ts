import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

// Backlog 4.18 (Partner products: list, stock editor, quick adjust) regression coverage,
// per docs/redesign/00-feature-inventory/partner/products.md. Serial mode: all tests share
// one seeded fixture pair + one seeded product/variant set, cleaned up once at the end.
test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
let pair: PartnerFixturePair;

const RUN_TAG = `e2e-4-18-${Date.now()}`;
let categoryId: string;
let healthyProductId: string;
let healthyVariantId: string;
let lowProductId: string;
let reservedVariantId: string;
let reservedProductId: string;

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma);

  const category = await prisma.category.create({
    data: { name: `فئة اختبار ${RUN_TAG}`, slug: `cat-${RUN_TAG}` },
  });
  categoryId = category.id;

  // "Healthy" product: sellable well above the default threshold (5) — used for the
  // search assertion and the delta quick-adjust assertion.
  const healthyProduct = await prisma.product.create({
    data: {
      categoryId,
      name: `منتج المخزون السليم ${RUN_TAG}`,
      slug: `healthy-${RUN_TAG}`,
      active: true,
    },
  });
  healthyProductId = healthyProduct.id;
  const healthyVariant = await prisma.variant.create({
    data: {
      productId: healthyProduct.id,
      sku: `SKU-HEALTHY-${RUN_TAG}`,
      name: "M",
      pricePiastres: 50000,
      stockAvailable: 0,
      stockReserved: 0,
    },
  });
  healthyVariantId = healthyVariant.id;
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: healthyVariant.id, stockAvailable: 50, stockReserved: 0 },
  });

  // "Low stock" product: sellable at/below the default threshold (5) — used for the
  // `?lowStock=1` chip assertion.
  const lowProduct = await prisma.product.create({
    data: {
      categoryId,
      name: `منتج المخزون المنخفض ${RUN_TAG}`,
      slug: `low-${RUN_TAG}`,
      active: true,
    },
  });
  lowProductId = lowProduct.id;
  const lowVariant = await prisma.variant.create({
    data: {
      productId: lowProduct.id,
      sku: `SKU-LOW-${RUN_TAG}`,
      name: "M",
      pricePiastres: 50000,
      stockAvailable: 0,
      stockReserved: 0,
    },
  });
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: lowVariant.id, stockAvailable: 3, stockReserved: 0 },
  });

  // Reserved product: stockReserved=3 for the partner — used for the below-reserved
  // rejection assertion (both the manual save and the quick-adjust minus path share it).
  const reservedProduct = await prisma.product.create({
    data: {
      categoryId,
      name: `منتج المخزون المحجوز ${RUN_TAG}`,
      slug: `reserved-${RUN_TAG}`,
      active: true,
    },
  });
  reservedProductId = reservedProduct.id;
  const reservedVariant = await prisma.variant.create({
    data: {
      productId: reservedProduct.id,
      sku: `SKU-RESERVED-${RUN_TAG}`,
      name: "M",
      pricePiastres: 50000,
      stockAvailable: 0,
      stockReserved: 0,
    },
  });
  reservedVariantId = reservedVariant.id;
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: reservedVariant.id, stockAvailable: 5, stockReserved: 3 },
  });
});

test.afterAll(async () => {
  await prisma.inventoryLedger.deleteMany({ where: { partnerId: pair.agent.partnerId } });
  await prisma.partnerInventory.deleteMany({ where: { partnerId: pair.agent.partnerId } });
  await prisma.variant.deleteMany({ where: { productId: { in: [healthyProductId, lowProductId, reservedProductId] } } });
  await prisma.product.deleteMany({ where: { id: { in: [healthyProductId, lowProductId, reservedProductId] } } });
  await prisma.category.delete({ where: { id: categoryId } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.$disconnect();
});

test("list renders, searches, and the lowStock chip filters to at/below-threshold products", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/products");

  await expect(page.getByRole("heading", { name: "المنتجات", exact: true })).toBeVisible();

  // Search narrows to the matching seeded product only.
  await page.getByPlaceholder("بحث بالاسم أو SKU…").fill(`منتج المخزون السليم ${RUN_TAG}`);
  await page.waitForTimeout(500); // debounce
  await expect(page.getByText(`منتج المخزون السليم ${RUN_TAG}`)).toBeVisible();
  await expect(page.getByText(`منتج المخزون المنخفض ${RUN_TAG}`)).toHaveCount(0);

  // Clear search, then toggle the low-stock chip: only the low-stock seeded product remains
  // visible among the three seeded ones (healthy=50 sellable, low=3 sellable <= default
  // threshold 5, reserved=5-3=2 sellable <= 5 too — both low/reserved products qualify).
  await page.getByPlaceholder("بحث بالاسم أو SKU…").fill(RUN_TAG);
  await page.waitForTimeout(500);
  const [lowStockResponse] = await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/partner/inventory") && res.url().includes("lowStock=1")),
    page.getByRole("button", { name: "مخزون منخفض فقط" }).click(),
  ]);
  expect(lowStockResponse.ok()).toBeTruthy();
  await expect(page).toHaveURL(/lowStock=1/);
  await expect(page.getByText(`منتج المخزون المنخفض ${RUN_TAG}`)).toBeVisible();
  await expect(page.getByText(`منتج المخزون المحجوز ${RUN_TAG}`)).toBeVisible();
  await expect(page.getByText(`منتج المخزون السليم ${RUN_TAG}`)).toHaveCount(0);
});

test("detail page blocks a stock value below stockReserved with the exact message", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/products/${reservedProductId}`);

  await expect(page.getByRole("heading", { name: `منتج المخزون المحجوز ${RUN_TAG}` })).toBeVisible();

  const availableInput = page.getByRole("textbox", { name: /المتاح لمتغير/ });
  await availableInput.fill("1");
  await page.getByRole("button", { name: "حفظ" }).click();

  const toastRegion = page.getByRole("region", { name: /Notifications/ });
  await expect(toastRegion.getByText("لا يمكن أن يكون المخزون أقل من المحجوز (3)")).toBeVisible();
});

test("a delta quick-adjust persists, writes a MANUAL_ADJUSTMENT ledger row, and is restored", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/products/${healthyProductId}`);

  await expect(page.getByRole("heading", { name: `منتج المخزون السليم ${RUN_TAG}` })).toBeVisible();

  const quantityInput = page.getByLabel(/كمية التعديل السريع/);
  await quantityInput.fill("10");
  await page.getByRole("button", { name: /زيادة المتاح/ }).click();

  const toastRegion = page.getByRole("region", { name: /Notifications/ });
  await expect(toastRegion.getByText("تم حفظ المخزون")).toBeVisible();

  await expect(page.getByRole("textbox", { name: /المتاح لمتغير/ })).toHaveValue("60");

  const ledgerRows = await prisma.inventoryLedger.findMany({
    where: { partnerId: pair.agent.partnerId, variantId: healthyVariantId, reason: "MANUAL_ADJUSTMENT" },
    orderBy: { createdAt: "desc" },
  });
  expect(ledgerRows.length).toBeGreaterThan(0);
  expect(ledgerRows[0].quantityAvailableDelta).toBe(10);

  const inventoryRow = await prisma.partnerInventory.findUnique({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: healthyVariantId } },
  });
  expect(inventoryRow?.stockAvailable).toBe(60);

  // Restore: subtract the same 10 back via the quick-adjust minus control.
  await quantityInput.fill("10");
  await page.getByRole("button", { name: /إنقاص المتاح/ }).click();
  await expect(page.getByRole("textbox", { name: /المتاح لمتغير/ })).toHaveValue("50");

  const restored = await prisma.partnerInventory.findUnique({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: healthyVariantId } },
  });
  expect(restored?.stockAvailable).toBe(50);
});
