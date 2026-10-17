import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import { seedPartnerPair, cleanupPartnerPair, loginAs, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 11.3 (counter sale + receipt). Fixtures are this spec's own: an AGENT + outlet pair
 * from `seedPartnerPair`, one category / product and two variants stocked at the outlet
 * (v1 10/0 at 100 EGP, v2 5/1 at 250 EGP, so v2 sellable is 4). Cleanup is by id, including
 * StoreSaleItem and StoreSale, before the pair's own cleanup.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const prisma = new PrismaClient();
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

let pair: PartnerFixturePair;
let categoryId: string;
let productId: string;
let v1: string;
let v2: string;
const productName = `منتج المبيعات ${suffix}`;

async function stock(variantId: string) {
  return prisma.partnerInventory.findUniqueOrThrow({
    where: { partnerId_variantId: { partnerId: pair.distributor.partnerId, variantId } },
  });
}

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma);
  const category = await prisma.category.create({ data: { name: `فئة المبيعات ${suffix}`, slug: `sales-cat-${suffix}` } });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: productName, slug: `sales-product-${suffix}`, active: true },
  });
  productId = product.id;
  v1 = (await prisma.variant.create({ data: { productId, sku: `SALES-A-${suffix}`, name: "M", colorName: "أحمر", pricePiastres: 10000 } })).id;
  v2 = (await prisma.variant.create({ data: { productId, sku: `SALES-B-${suffix}`, name: "L", colorName: "أزرق", pricePiastres: 25000 } })).id;
  await prisma.partnerInventory.create({ data: { partnerId: pair.distributor.partnerId, variantId: v1, stockAvailable: 10, stockReserved: 0 } });
  await prisma.partnerInventory.create({ data: { partnerId: pair.distributor.partnerId, variantId: v2, stockAvailable: 5, stockReserved: 1 } });
});

test.afterAll(async () => {
  const partnerId = pair.distributor.partnerId;
  await prisma.storeSaleItem.deleteMany({ where: safeWhere({ sale: { partnerId } }) });
  await prisma.storeSale.deleteMany({ where: safeWhere({ partnerId }) });
  await prisma.inventoryLedger.deleteMany({ where: safeWhere({ variantId: { in: [v1, v2] } }) });
  await prisma.partnerInventory.deleteMany({ where: safeWhere({ variantId: { in: [v1, v2] } }) });
  await prisma.variant.deleteMany({ where: safeWhere({ id: { in: [v1, v2] } }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await cleanupPartnerPair(prisma, pair);
  await prisma.$disconnect();
});

test("counter sale of two lines drops stock, writes STORE_SALE ledger lines and shows the receipt", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner/sales/new");

  await page.getByTestId("counter-search").fill(suffix);
  const rowA = page.locator(`[data-testid="counter-result"][data-sku="SALES-A-${suffix}"]`);
  const rowB = page.locator(`[data-testid="counter-result"][data-sku="SALES-B-${suffix}"]`);
  await expect(rowA).toBeVisible();
  await expect(rowB).toContainText("متاح");
  await rowA.click();
  await rowA.click();
  await rowB.click();

  await expect(page.getByTestId("cart-line")).toHaveCount(2);
  await expect(page.getByTestId("cart-total")).toHaveText("450");
  // Stepper capped at sellable: v1 has 10, so 2 is not the cap; v2 sellable is 4.
  await expect(page.getByRole("button", { name: "تأكيد البيع" })).toBeEnabled();
  await page.getByLabel("اسم البائع").fill("منى");
  await page.getByRole("radio", { name: "إنستاباي" }).click();
  await page.getByRole("button", { name: "تأكيد البيع" }).click();

  await expect(page).toHaveURL(/\/partner\/sales\/[a-z0-9]+$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "إيصال رقم 1" })).toBeVisible();
  await expect(page.getByTestId("screen-line")).toHaveCount(2);
  await expect(page.getByTestId("screen-total")).toHaveText("450");
  await expect(page.getByTestId("receipt-card")).toContainText("إنستاباي");

  const a = await stock(v1);
  const b = await stock(v2);
  expect(a.stockAvailable).toBe(8);
  expect(b.stockAvailable).toBe(4);
  expect(a.stockReserved).toBe(0);
  expect(b.stockReserved).toBe(1);

  const sale = await prisma.storeSale.findFirstOrThrow({
    where: { partnerId: pair.distributor.partnerId, receiptNo: 1 },
    include: { items: true },
  });
  expect(sale.subtotalPiastres).toBe(45000);
  expect(sale.sellerName).toBe("منى");
  expect(sale.recordedByUserId).toBe(pair.distributor.userId);
  expect(sale.items).toHaveLength(2);
  const ledger = await prisma.inventoryLedger.findMany({
    where: { partnerId: pair.distributor.partnerId, reason: "STORE_SALE" },
    orderBy: { quantityAvailableDelta: "asc" },
  });
  expect(ledger.map((l) => l.quantityAvailableDelta)).toEqual([-2, -1]);
  expect(ledger.every((l) => l.quantityReservedDelta === 0 && l.notes?.includes(sale.id))).toBe(true);
});

test("a second sale gets receiptNo + 1; an over-stock sale is refused with names and writes nothing", async ({ page }) => {
  await loginAs(page, pair, "DISTRIBUTOR");

  const second = await page.request.post("/api/partner/sales", {
    data: { items: [{ variantId: v1, quantity: 1 }], paymentMethod: "CASH", customerPhone: "01012345678" },
  });
  expect(second.status()).toBe(201);
  const body = await second.json();
  expect(body.data.sale.receiptNo).toBe(2);
  expect(body.data.sale.customerPhone).toBe("+201012345678");

  const before = await prisma.storeSale.count({ where: { partnerId: pair.distributor.partnerId } });
  const ledgerBefore = await prisma.inventoryLedger.count({ where: { partnerId: pair.distributor.partnerId, reason: "STORE_SALE" } });
  const availableBefore = (await stock(v2)).stockAvailable;

  const refused = await page.request.post("/api/partner/sales", {
    data: { items: [{ variantId: v1, quantity: 1 }, { variantId: v2, quantity: 5 }], paymentMethod: "CASH" },
  });
  expect(refused.status()).toBe(409);
  const refusedBody = await refused.json();
  expect(refusedBody.error.message).toContain("المتاح من");
  expect(refusedBody.error.message).toContain(productName);
  expect(refusedBody.error.message).toContain("3 فقط");
  expect(refusedBody.error.details.shortLines).toHaveLength(1);

  expect(await prisma.storeSale.count({ where: { partnerId: pair.distributor.partnerId } })).toBe(before);
  expect(await prisma.inventoryLedger.count({ where: { partnerId: pair.distributor.partnerId, reason: "STORE_SALE" } })).toBe(ledgerBefore);
  expect((await stock(v2)).stockAvailable).toBe(availableBefore);

  const badPhone = await page.request.post("/api/partner/sales", {
    data: { items: [{ variantId: v1, quantity: 1 }], paymentMethod: "CASH", customerPhone: "123" },
  });
  expect(badPhone.status()).toBe(400);
});

test("an agent is refused with 403", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  const res = await page.request.post("/api/partner/sales", {
    data: { items: [{ variantId: v1, quantity: 1 }], paymentMethod: "CASH" },
  });
  expect(res.status()).toBe(403);
  const sale = await prisma.storeSale.findFirstOrThrow({ where: { partnerId: pair.distributor.partnerId, receiptNo: 1 } });
  const get = await page.request.get(`/api/partner/sales/${sale.id}`);
  expect(get.status()).toBe(404);
});

test("print layout smoke at 80 mm width", async ({ page }) => {
  await page.setViewportSize({ width: 302, height: 900 });
  await loginAs(page, pair, "DISTRIBUTOR");
  const sale = await prisma.storeSale.findFirstOrThrow({ where: { partnerId: pair.distributor.partnerId, receiptNo: 1 } });
  await page.goto(`/partner/sales/${sale.id}`);
  await expect(page.getByTestId("receipt-card")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  const slip = page.getByTestId("receipt-slip");
  await expect(slip).toBeVisible();
  await expect(page.getByTestId("receipt-card")).toBeHidden();
  await expect(slip).toContainText("إيصال رقم");
  await expect(slip).toContainText("شكراً لتسوقكم من ملوك النيل");
  await expect(page.getByTestId("receipt-line")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(302);

  fs.mkdirSync("test-results/11.3", { recursive: true });
  await page.screenshot({ path: "test-results/11.3/receipt-80mm.png", fullPage: true });
});
