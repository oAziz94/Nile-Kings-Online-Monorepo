import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

// Backlog 4.23 (Factory intake and inventory import/export) coverage, per
// docs/redesign/03-backlog.md's 4.23 entry. Serial mode: one seeded fixture pair + one
// seeded product/variant set shared across tests, cleaned up once at the end.
test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
let pair: PartnerFixturePair;

const RUN_TAG = `e2e-4-23-${Date.now()}`;
let categoryId: string;
let productId: string;
const productName = `منتج إيصالات ${RUN_TAG}`;
let factoryVariantId: string;
let countValidVariantId: string;
let countReservedVariantId: string;
let parallelVariantId: string;
const factorySku = `SKU-FACTORY-${RUN_TAG}`;
const countValidSku = `SKU-COUNT-VALID-${RUN_TAG}`;
const countReservedSku = `SKU-COUNT-RESERVED-${RUN_TAG}`;
const unknownSku = `SKU-UNKNOWN-${RUN_TAG}`;

function buildXlsxBuffer(rows: (string | number)[][]): Buffer {
  const header = [
    "SKU",
    "المنتج",
    "المقاس",
    "اللون",
    "المتاح",
    "المحجوز",
    "قابل للبيع",
    "حد التنبيه",
    "كمية مستلمة",
    "جرد فعلي",
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Inventory");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma);

  const category = await prisma.category.create({
    data: { name: `فئة اختبار ${RUN_TAG}`, slug: `cat-${RUN_TAG}` },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: { categoryId, name: productName, slug: `receipts-${RUN_TAG}`, active: true },
  });
  productId = product.id;

  const factoryVariant = await prisma.variant.create({
    data: { productId, sku: factorySku, name: "M", pricePiastres: 50000, stockAvailable: 0, stockReserved: 0 },
  });
  factoryVariantId = factoryVariant.id;
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: factoryVariant.id, stockAvailable: 20, stockReserved: 0 },
  });

  const countValidVariant = await prisma.variant.create({
    data: { productId, sku: countValidSku, name: "L", pricePiastres: 50000, stockAvailable: 0, stockReserved: 0 },
  });
  countValidVariantId = countValidVariant.id;
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: countValidVariant.id, stockAvailable: 10, stockReserved: 2 },
  });

  const countReservedVariant = await prisma.variant.create({
    data: { productId, sku: countReservedSku, name: "XL", pricePiastres: 50000, stockAvailable: 0, stockReserved: 0 },
  });
  countReservedVariantId = countReservedVariant.id;
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: countReservedVariant.id, stockAvailable: 10, stockReserved: 8 },
  });

  const parallelVariant = await prisma.variant.create({
    data: { productId, sku: `SKU-PARALLEL-${RUN_TAG}`, name: "XXL", pricePiastres: 50000, stockAvailable: 0, stockReserved: 0 },
  });
  parallelVariantId = parallelVariant.id;
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: parallelVariant.id, stockAvailable: 0, stockReserved: 0 },
  });
});

test.afterAll(async () => {
  await prisma.stockReceiptLine.deleteMany({ where: { receipt: { partnerId: pair.agent.partnerId } } });
  await prisma.stockReceipt.deleteMany({ where: { partnerId: pair.agent.partnerId } });
  await prisma.inventoryLedger.deleteMany({ where: { partnerId: pair.agent.partnerId } });
  await prisma.partnerInventory.deleteMany({ where: { partnerId: pair.agent.partnerId } });
  await prisma.variant.deleteMany({ where: { productId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.$disconnect();
});

test("export downloads an xlsx with the exact column header row", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  const res = await page.request.get("/api/partner/inventory/export");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-disposition"]).toMatch(/inventory_\d{4}_\d{2}_\d{2}\.xlsx/);

  const buffer = await res.body();
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
  expect(grid[0]).toEqual([
    "SKU",
    "المنتج",
    "المقاس",
    "اللون",
    "المتاح",
    "المحجوز",
    "قابل للبيع",
    "حد التنبيه",
    "كمية مستلمة",
    "جرد فعلي",
  ]);

  // Our seeded factory-receipt variant is in the export with its real numbers.
  const row = (grid as unknown[][]).find((r) => r[0] === factorySku);
  expect(row).toBeTruthy();
  expect(row?.[4]).toBe(20); // المتاح
  expect(row?.[5]).toBe(0); // المحجوز
});

test("a typed FACTORY receipt raises stock and writes a FACTORY_RECEIPT ledger row with the receipt id", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/receipts/new");
  await expect(page.getByRole("heading", { name: "استلام جديد" })).toBeVisible();

  // FACTORY is the default kind.
  await page.getByPlaceholder("بحث عن منتج أو SKU").fill(factorySku);
  const variantSelect = page.getByLabel("المتغير");
  const factoryOptionLabel = `${productName} - M - ${factorySku}`;
  await expect(variantSelect.locator(`option:has-text("${factorySku}")`)).toBeAttached({ timeout: 10_000 });
  await variantSelect.selectOption({ label: factoryOptionLabel });

  await page.getByLabel("الكمية").fill("15");
  await page.getByRole("button", { name: "إضافة" }).click();

  await expect(page.getByText("15", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "تأكيد الاستلام" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const [postResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/partner/receipts") && res.request().method() === "POST"
    ),
    dialog.getByRole("button", { name: "تأكيد الاستلام" }).click(),
  ]);
  expect(postResponse.ok()).toBeTruthy();

  // The apply POST can take a few seconds against the remote redesign DB (several sequential
  // locked read-write round trips) — wait for the real receipt-id URL, not the loose "still on
  // /new" match a naive regex would also satisfy instantly.
  await page.waitForURL((url) => /\/partner\/receipts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"), {
    timeout: 15_000,
  });

  // The receipt is the printable record: under print media every piece of app chrome (sidebar,
  // mobile header, desktop topbar with the bell) is hidden (4.23 verifier finding, 2026-09-13).
  await page.emulateMedia({ media: "print" });
  for (const el of await page.locator("[data-partner-chrome]").all()) await expect(el).toBeHidden();
  await expect(page.getByRole("button", { name: /الإشعارات/ })).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  const inventoryRow = await prisma.partnerInventory.findUnique({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: factoryVariantId } },
  });
  expect(inventoryRow?.stockAvailable).toBe(35);

  const receiptId = page.url().split("/").pop()!;
  const ledgerRows = await prisma.inventoryLedger.findMany({
    where: { partnerId: pair.agent.partnerId, variantId: factoryVariantId, reason: "FACTORY_RECEIPT" },
  });
  expect(ledgerRows).toHaveLength(1);
  expect(ledgerRows[0].quantityAvailableDelta).toBe(15);
  expect(ledgerRows[0].stockReceiptId).toBe(receiptId);

  const receipt = await prisma.stockReceipt.findUnique({ where: { id: receiptId }, include: { lines: true } });
  expect(receipt?.kind).toBe("FACTORY");
  expect(receipt?.lines).toHaveLength(1);
  expect(receipt?.lines[0].previousAvailable).toBe(20);
  expect(receipt?.lines[0].newAvailable).toBe(35);
});

test("a COUNT import preview flags an unknown SKU and a below-reserved count, and applying the rest sets the totals", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/receipts/new");

  await page.getByRole("radio", { name: "جرد فعلي" }).click();
  await page.getByRole("tab", { name: "رفع ملف" }).click();

  const buffer = buildXlsxBuffer([
    [countValidSku, "", "", "", "", "", "", "", "", 15],
    [unknownSku, "", "", "", "", "", "", "", "", 5],
    [countReservedSku, "", "", "", "", "", "", "", "", 3],
  ]);

  await page.getByLabel("اختيار ملف المخزون").setInputFiles({
    name: "inventory-count.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });

  await expect(page.getByText("SKU غير معروف")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/لا يمكن أن يكون المخزون أقل من المحجوز \(8\)/)).toBeVisible();
  await expect(page.getByText("1 بند صالح")).toBeVisible();

  await page.getByRole("button", { name: "تأكيد الاستلام" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/2 بند/)).toBeVisible();
  const [postResponse] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/partner/receipts") && res.request().method() === "POST"
    ),
    dialog.getByRole("button", { name: "تأكيد الاستلام" }).click(),
  ]);
  expect(postResponse.ok()).toBeTruthy();

  await page.waitForURL((url) => /\/partner\/receipts\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"), {
    timeout: 15_000,
  });

  const validRow = await prisma.partnerInventory.findUnique({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: countValidVariantId } },
  });
  expect(validRow?.stockAvailable).toBe(15);

  const reservedRow = await prisma.partnerInventory.findUnique({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: countReservedVariantId } },
  });
  expect(reservedRow?.stockAvailable).toBe(10); // untouched — excluded from the apply payload

  const ledgerRows = await prisma.inventoryLedger.findMany({
    where: { partnerId: pair.agent.partnerId, variantId: countValidVariantId, reason: "STOCK_COUNT" },
  });
  expect(ledgerRows).toHaveLength(1);
  expect(ledgerRows[0].quantityAvailableDelta).toBe(5); // 15 - 10

  const receiptId = page.url().split("/").pop()!;
  const receipt = await prisma.stockReceipt.findUnique({ where: { id: receiptId }, include: { lines: true } });
  expect(receipt?.kind).toBe("COUNT");
  expect(receipt?.lines).toHaveLength(1); // only the valid row was applied
});

test("a distributor gets the role panel on the receipts list and the new-receipt form", async ({ page }) => {
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner/receipts");
  await expect(page.getByText("هذه الصفحة متاحة للوكلاء فقط")).toBeVisible();

  await page.goto("/partner/receipts/new");
  await expect(page.getByText("هذه الصفحة متاحة للوكلاء فقط")).toBeVisible();
});

test("parallel FACTORY receipts on one variant serialise: no lost update, ledger sums to the stock change", async ({ page }) => {
  await loginAs(page, pair, "AGENT");

  const before = await prisma.partnerInventory.findUnique({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: parallelVariantId } },
  });
  const start = before?.stockAvailable ?? 0;

  const responses = await Promise.all(
    Array.from({ length: 4 }, () =>
      page.request.post("/api/partner/receipts", {
        data: { kind: "FACTORY", lines: [{ variantId: parallelVariantId, quantity: 3 }] },
      })
    )
  );
  for (const res of responses) expect(res.ok()).toBeTruthy();

  const after = await prisma.partnerInventory.findUnique({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: parallelVariantId } },
  });
  expect(after?.stockAvailable).toBe(start + 12);

  const ledgerRows = await prisma.inventoryLedger.findMany({
    where: { partnerId: pair.agent.partnerId, variantId: parallelVariantId, reason: "FACTORY_RECEIPT" },
  });
  expect(ledgerRows).toHaveLength(4);
  expect(ledgerRows.reduce((sum, r) => sum + r.quantityAvailableDelta, 0)).toBe(12);

  const receipts = await prisma.stockReceipt.findMany({
    where: { partnerId: pair.agent.partnerId, lines: { some: { variantId: parallelVariantId } } },
  });
  expect(receipts).toHaveLength(4);
});
