import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 5.4 (المخزون hub) coverage. Folds the behaviours of the old
 * `partner-products.spec.ts`, `partner-receipts.spec.ts` (un-skipped by this task) and
 * `partner-restock.spec.ts` (un-skipped by this task) into the new tab routes under
 * `/partner/stock/*`, plus the new movements tab and the cover column. Each concern gets
 * its own serial `test.describe` block with its own seeded fixtures, cleaned up in that
 * block's `afterAll` — this file replaces all three old specs (backlog 5.4 task text:
 * "fold their behaviours into partner-v2-stock.spec.ts, delete the old three").
 */

const prisma = new PrismaClient();

test.describe("stock hub tabs", () => {
  test.describe.configure({ mode: "serial" });
  // Cold Turbopack compiles nine distinct routes (five tabs + four old redirect targets) in
  // one test — past the default 30s on a first run.
  test.setTimeout(90_000);
  let pair: PartnerFixturePair;

  test.beforeAll(async () => {
    pair = await seedPartnerPair(prisma);
  });
  test.afterAll(async () => {
    await cleanupPartnerPair(prisma, pair);
    await prisma.$disconnect();
  });

  test("every tab is reachable and old routes redirect into the hub", async ({ page }) => {
    await loginAs(page, pair, "AGENT");

    await page.goto("/partner/stock");
    await expect(page.getByRole("heading", { name: "المخزون", exact: true })).toBeVisible({ timeout: 15_000 });

    for (const [href, label] of [
      ["/partner/stock/movements", "الحركات"],
      ["/partner/stock/intake", "الاستلام من المصنع"],
      ["/partner/stock/counts", "الجرد"],
      ["/partner/stock/requests", "طلبات التوريد"],
    ] as const) {
      await page.getByRole("link", { name: label }).click();
      // Cold Turbopack compile of each newly-visited tab route can outlast the default 5s
      // expect timeout on a first run — 15s comfortably covers it without weakening the
      // assertion itself.
      await expect(page).toHaveURL(new RegExp(href.replace(/\//g, "\\/")), { timeout: 15_000 });
    }

    // Old v1 routes still resolve, into the hub.
    await page.goto("/partner/products");
    await expect(page).toHaveURL(/\/partner\/stock$/);
    await page.goto("/partner/receipts");
    await expect(page).toHaveURL(/\/partner\/stock\/intake$/);
    await page.goto("/partner/restock-requests");
    await expect(page).toHaveURL(/\/partner\/stock\/requests$/);
    await page.goto("/partner/distributor-requests");
    await expect(page).toHaveURL(/\/partner\/stock\/requests$/);
  });

  test("a distributor does not see the AGENT-only intake/counts tabs", async ({ page }) => {
    await loginAs(page, pair, "DISTRIBUTOR");
    await page.goto("/partner/stock");
    await expect(page.getByRole("link", { name: "الاستلام من المصنع" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "الجرد" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "طلبات التوريد" })).toBeVisible();
  });
});

test.describe("stock index: search, thresholds, quick adjust, cover", () => {
  test.describe.configure({ mode: "serial" });
  let pair: PartnerFixturePair;
  const RUN_TAG = `e2e-5-4-stock-${Date.now()}`;
  let categoryId: string;
  let healthyProductId: string;
  let healthyVariantId: string;
  let lowProductId: string;
  let reservedVariantId: string;
  let reservedProductId: string;
  let coverProductId: string;
  let coverVariantId: string;

  test.beforeAll(async () => {
    pair = await seedPartnerPair(prisma);
    const category = await prisma.category.create({
      data: { name: `فئة اختبار ${RUN_TAG}`, slug: `cat-${RUN_TAG}` },
    });
    categoryId = category.id;

    const healthyProduct = await prisma.product.create({
      data: { categoryId, name: `منتج المخزون السليم ${RUN_TAG}`, slug: `healthy-${RUN_TAG}`, active: true },
    });
    healthyProductId = healthyProduct.id;
    const healthyVariant = await prisma.variant.create({
      data: { productId: healthyProduct.id, sku: `SKU-HEALTHY-${RUN_TAG}`, name: "M", pricePiastres: 50000 },
    });
    healthyVariantId = healthyVariant.id;
    await prisma.partnerInventory.create({
      data: { partnerId: pair.agent.partnerId, variantId: healthyVariant.id, stockAvailable: 50, stockReserved: 0 },
    });

    const lowProduct = await prisma.product.create({
      data: { categoryId, name: `منتج المخزون المنخفض ${RUN_TAG}`, slug: `low-${RUN_TAG}`, active: true },
    });
    lowProductId = lowProduct.id;
    const lowVariant = await prisma.variant.create({
      data: { productId: lowProductId, sku: `SKU-LOW-${RUN_TAG}`, name: "M", pricePiastres: 50000 },
    });
    await prisma.partnerInventory.create({
      data: { partnerId: pair.agent.partnerId, variantId: lowVariant.id, stockAvailable: 3, stockReserved: 0 },
    });

    const reservedProduct = await prisma.product.create({
      data: { categoryId, name: `منتج المخزون المحجوز ${RUN_TAG}`, slug: `reserved-${RUN_TAG}`, active: true },
    });
    reservedProductId = reservedProduct.id;
    const reservedVariant = await prisma.variant.create({
      data: { productId: reservedProductId, sku: `SKU-RESERVED-${RUN_TAG}`, name: "M", pricePiastres: 50000 },
    });
    reservedVariantId = reservedVariant.id;
    await prisma.partnerInventory.create({
      data: { partnerId: pair.agent.partnerId, variantId: reservedVariant.id, stockAvailable: 5, stockReserved: 3 },
    });

    // Cover column: 30 units sold in the last 30 days on the partner's non-cancelled orders,
    // sellable 60 -> 60 / (30/30) = 60 days of cover.
    const coverProduct = await prisma.product.create({
      data: { categoryId, name: `منتج تغطية ${RUN_TAG}`, slug: `cover-${RUN_TAG}`, active: true },
    });
    coverProductId = coverProduct.id;
    const coverVariant = await prisma.variant.create({
      data: { productId: coverProductId, sku: `SKU-COVER-${RUN_TAG}`, name: "M", pricePiastres: 50000 },
    });
    coverVariantId = coverVariant.id;
    await prisma.partnerInventory.create({
      data: { partnerId: pair.agent.partnerId, variantId: coverVariant.id, stockAvailable: 60, stockReserved: 0 },
    });
    const buyer = await prisma.user.create({ data: { phone: `+2010${Date.now()}`.slice(0, 13), role: "CUSTOMER", passwordHash: "x" } });
    const order = await prisma.order.create({
      data: {
        userId: buyer.id,
        status: "DELIVERED",
        subtotalPiastres: 50000 * 30,
        totalPiastres: 50000 * 30,
        shippingAddress: {},
        shippingProvider: "Egypt Post",
        paymentMethod: "COD",
        assignedPartnerId: pair.agent.partnerId,
        items: {
          create: [
            {
              variantId: coverVariant.id,
              productName: coverProduct.name,
              variantName: "M",
              sku: coverVariant.sku,
              quantity: 30,
              unitPricePiastres: 50000,
              totalPiastres: 50000 * 30,
            },
          ],
        },
      },
    });
    (global as unknown as { __coverOrderId?: string }).__coverOrderId = order.id;
    (global as unknown as { __coverBuyerId?: string }).__coverBuyerId = buyer.id;
  });

  test.afterAll(async () => {
    const orderId = (global as unknown as { __coverOrderId?: string }).__coverOrderId;
    const buyerId = (global as unknown as { __coverBuyerId?: string }).__coverBuyerId;
    if (orderId) {
      await prisma.orderItem.deleteMany({ where: safeWhere({ orderId }) });
      await prisma.order.delete({ where: safeWhere({ id: orderId }) });
    }
    if (buyerId) await prisma.user.delete({ where: safeWhere({ id: buyerId }) });
    await prisma.inventoryLedger.deleteMany({ where: safeWhere({ partnerId: pair.agent.partnerId }) });
    await prisma.partnerInventory.deleteMany({ where: safeWhere({ partnerId: pair.agent.partnerId }) });
    await prisma.variant.deleteMany({
      where: { productId: { in: [healthyProductId, lowProductId, reservedProductId, coverProductId] } },
    });
    await prisma.product.deleteMany({ where: { id: { in: [healthyProductId, lowProductId, reservedProductId, coverProductId] } } });
    await prisma.category.delete({ where: safeWhere({ id: categoryId }) });
    await cleanupPartnerPair(prisma, pair);
    await prisma.$disconnect();
  });

  test("search and the low-stock chip filter the stock table", async ({ page }) => {
    await loginAs(page, pair, "AGENT");
    await page.goto("/partner/stock");
    await expect(page.getByRole("heading", { name: "المخزون", exact: true })).toBeVisible({ timeout: 15_000 });

    const searchQuery = `منتج المخزون السليم ${RUN_TAG}`;
    const [searchResponse] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/partner/inventory") && new URL(res.url()).searchParams.get("q") === searchQuery
      ),
      page.getByPlaceholder("بحث بالاسم أو SKU…").fill(searchQuery),
    ]);
    expect(searchResponse.ok()).toBeTruthy();
    await expect(page.getByText(searchQuery)).toBeVisible();
    await expect(page.getByText(`منتج المخزون المنخفض ${RUN_TAG}`)).toHaveCount(0);

    const [clearResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/partner/inventory") && new URL(res.url()).searchParams.get("q") === RUN_TAG),
      page.getByPlaceholder("بحث بالاسم أو SKU…").fill(RUN_TAG),
    ]);
    expect(clearResponse.ok()).toBeTruthy();
    const [lowStockResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/partner/inventory") && res.url().includes("lowStock=1")),
      page.getByRole("button", { name: "تحت الحد فقط" }).click(),
    ]);
    expect(lowStockResponse.ok()).toBeTruthy();
    await expect(page).toHaveURL(/lowStock=1/);
    await expect(page.getByText(`منتج المخزون المنخفض ${RUN_TAG}`)).toBeVisible();
    await expect(page.getByText(`منتج المخزون المحجوز ${RUN_TAG}`)).toBeVisible();
    await expect(page.getByText(`منتج المخزون السليم ${RUN_TAG}`)).toHaveCount(0);
  });

  test("10.16 — stock list row shows the product's slug; the variant editor row shows its SKU", async ({ page }) => {
    await loginAs(page, pair, "AGENT");
    await page.goto(`/partner/stock?q=${encodeURIComponent(`منتج المخزون السليم ${RUN_TAG}`)}`);
    await expect(page.getByRole("heading", { name: "المخزون", exact: true })).toBeVisible({ timeout: 15_000 });
    const row = page.getByRole("row").filter({ hasText: `منتج المخزون السليم ${RUN_TAG}` });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText(`healthy-${RUN_TAG}`);

    await page.goto(`/partner/stock/products/${healthyProductId}`);
    await expect(page.getByRole("heading", { name: `منتج المخزون السليم ${RUN_TAG}` })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(`SKU-HEALTHY-${RUN_TAG}`, { exact: true }).first()).toBeVisible();
  });

  test("variant editor blocks a stock value below stockReserved with the exact message", async ({ page }) => {
    await loginAs(page, pair, "AGENT");
    await page.goto(`/partner/stock/products/${reservedProductId}`);
    await expect(page.getByRole("heading", { name: `منتج المخزون المحجوز ${RUN_TAG}` })).toBeVisible({ timeout: 15_000 });

    const availableInput = page.getByRole("textbox", { name: /المتاح لمتغير/ });
    await availableInput.fill("1");
    await page.getByRole("button", { name: "حفظ" }).click();

    const toastRegion = page.getByRole("region", { name: /Notifications/ });
    await expect(toastRegion.getByText("لا يمكن أن يكون المخزون أقل من المحجوز (3)")).toBeVisible();
  });

  test("a delta quick-adjust persists and is restored; four parallel deltas serialise with no lost update", async ({ page }) => {
    await loginAs(page, pair, "AGENT");
    await page.goto(`/partner/stock/products/${healthyProductId}`);
    await expect(page.getByRole("heading", { name: `منتج المخزون السليم ${RUN_TAG}` })).toBeVisible({ timeout: 15_000 });

    const quantityInput = page.getByLabel(/كمية التعديل السريع/);
    await quantityInput.fill("10");
    await page.getByRole("button", { name: /زيادة المتاح/ }).click();
    const toastRegion = page.getByRole("region", { name: /Notifications/ });
    await expect(toastRegion.getByText("تم حفظ المخزون")).toBeVisible();
    await expect(page.getByRole("textbox", { name: /المتاح لمتغير/ })).toHaveValue("60");

    await quantityInput.fill("10");
    await page.getByRole("button", { name: /إنقاص المتاح/ }).click();
    await expect(page.getByRole("textbox", { name: /المتاح لمتغير/ })).toHaveValue("50");

    // Parallel-request assertion (the PATCH endpoint is unchanged by this task).
    const before = await prisma.partnerInventory.findUnique({
      where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: healthyVariantId } },
    });
    const start = before?.stockAvailable ?? 0;
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => page.request.patch("/api/partner/inventory", { data: { variantId: healthyVariantId, delta: 1 } }))
    );
    for (const res of responses) expect(res.ok()).toBeTruthy();
    const after = await prisma.partnerInventory.findUnique({
      where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: healthyVariantId } },
    });
    expect(after?.stockAvailable).toBe(start + 4);
    const restore = await page.request.patch("/api/partner/inventory", { data: { variantId: healthyVariantId, delta: -4 } });
    expect(restore.ok()).toBeTruthy();
  });

  test("days-of-cover matches a seeded 30-day sale history", async ({ page }) => {
    await loginAs(page, pair, "AGENT");
    const res = await page.request.get(`/api/partner/inventory?q=${encodeURIComponent(RUN_TAG)}&limit=50`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const product = json.data.products.find((p: { id: string }) => p.id === coverProductId);
    expect(product).toBeTruthy();
    const variant = product.variants.find((v: { id: string }) => v.id === coverVariantId);
    // sellable 60, 30 units sold in 30 days -> velocity 1/day -> 60 days of cover.
    expect(variant.coverDays).toBe(60);
  });
});

test.describe("intake and counts (moved receipts screens)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);
  let pair: PartnerFixturePair;
  const RUN_TAG = `e2e-5-4-intake-${Date.now()}`;
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
    const header = ["SKU", "المنتج", "المقاس", "اللون", "المتاح", "المحجوز", "قابل للبيع", "حد التنبيه", "كمية مستلمة", "جرد فعلي"];
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory");
    return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  }

  test.beforeAll(async () => {
    pair = await seedPartnerPair(prisma);
    const category = await prisma.category.create({ data: { name: `فئة اختبار ${RUN_TAG}`, slug: `cat-${RUN_TAG}` } });
    categoryId = category.id;
    const product = await prisma.product.create({ data: { categoryId, name: productName, slug: `receipts-${RUN_TAG}`, active: true } });
    productId = product.id;

    const factoryVariant = await prisma.variant.create({
      data: { productId, sku: factorySku, name: "M", pricePiastres: 50000 },
    });
    factoryVariantId = factoryVariant.id;
    await prisma.partnerInventory.create({ data: { partnerId: pair.agent.partnerId, variantId: factoryVariant.id, stockAvailable: 20, stockReserved: 0 } });

    const countValidVariant = await prisma.variant.create({
      data: { productId, sku: countValidSku, name: "L", pricePiastres: 50000 },
    });
    countValidVariantId = countValidVariant.id;
    await prisma.partnerInventory.create({ data: { partnerId: pair.agent.partnerId, variantId: countValidVariant.id, stockAvailable: 10, stockReserved: 2 } });

    const countReservedVariant = await prisma.variant.create({
      data: { productId, sku: countReservedSku, name: "XL", pricePiastres: 50000 },
    });
    countReservedVariantId = countReservedVariant.id;
    await prisma.partnerInventory.create({ data: { partnerId: pair.agent.partnerId, variantId: countReservedVariant.id, stockAvailable: 10, stockReserved: 8 } });

    const parallelVariant = await prisma.variant.create({
      data: { productId, sku: `SKU-PARALLEL-${RUN_TAG}`, name: "XXL", pricePiastres: 50000 },
    });
    parallelVariantId = parallelVariant.id;
    await prisma.partnerInventory.create({ data: { partnerId: pair.agent.partnerId, variantId: parallelVariant.id, stockAvailable: 0, stockReserved: 0 } });
  });

  test.afterAll(async () => {
    await prisma.stockReceiptLine.deleteMany({ where: { receipt: safeWhere({ partnerId: pair.agent.partnerId }) } });
    await prisma.stockReceipt.deleteMany({ where: safeWhere({ partnerId: pair.agent.partnerId }) });
    await prisma.inventoryLedger.deleteMany({ where: safeWhere({ partnerId: pair.agent.partnerId }) });
    await prisma.partnerInventory.deleteMany({ where: safeWhere({ partnerId: pair.agent.partnerId }) });
    await prisma.variant.deleteMany({ where: safeWhere({ productId }) });
    await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
    await prisma.category.delete({ where: safeWhere({ id: categoryId }) });
    await cleanupPartnerPair(prisma, pair);
    await prisma.$disconnect();
  });

  test("a typed FACTORY receipt raises stock, writes a ledger row, and the printable detail hides chrome", async ({ page }) => {
    await loginAs(page, pair, "AGENT");
    await page.goto("/partner/stock/intake/new");
    await expect(page.getByRole("heading", { name: "استلام جديد" })).toBeVisible({ timeout: 15_000 });

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
      page.waitForResponse((res) => res.url().includes("/api/partner/receipts") && res.request().method() === "POST"),
      dialog.getByRole("button", { name: "تأكيد الاستلام" }).click(),
    ]);
    expect(postResponse.ok()).toBeTruthy();
    await page.waitForURL((url) => /\/partner\/stock\/intake\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"), {
      timeout: 15_000,
    });

    await page.emulateMedia({ media: "print" });
    for (const el of await page.locator("[data-partner-chrome]").all()) await expect(el).toBeHidden();
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
    expect(ledgerRows[0].stockReceiptId).toBe(receiptId);
  });

  test("a COUNT import preview flags an unknown SKU and a below-reserved count; applying the rest sets the totals", async ({ page }) => {
    await loginAs(page, pair, "AGENT");
    await page.goto("/partner/stock/intake/new?kind=COUNT");
    await expect(page.getByRole("radio", { name: "جرد فعلي" })).toHaveAttribute("aria-checked", "true");
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
    const [postResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes("/api/partner/receipts") && res.request().method() === "POST"),
      dialog.getByRole("button", { name: "تأكيد الاستلام" }).click(),
    ]);
    expect(postResponse.ok()).toBeTruthy();
    await page.waitForURL((url) => /\/partner\/stock\/intake\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"), {
      timeout: 15_000,
    });

    const validRow = await prisma.partnerInventory.findUnique({
      where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: countValidVariantId } },
    });
    expect(validRow?.stockAvailable).toBe(15);
    const reservedRow = await prisma.partnerInventory.findUnique({
      where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: countReservedVariantId } },
    });
    expect(reservedRow?.stockAvailable).toBe(10);

    const receiptId = page.url().split("/").pop()!;
    const receipt = await prisma.stockReceipt.findUnique({ where: { id: receiptId } });
    expect(receipt?.kind).toBe("COUNT");

    // The count is listed on the "الجرد" tab, not "الاستلام من المصنع" — the API's `kind`
    // split (backlog 5.4, additive) drives this.
    await page.goto("/partner/stock/counts");
    await expect(page.getByRole("cell", { name: "15", exact: true }).first()).toBeVisible();
    await page.goto("/partner/stock/intake");
    await expect(page.getByRole("cell", { name: "15", exact: true })).toHaveCount(0);
  });

  test("a distributor gets the role panel on intake and the new-receipt form", async ({ page }) => {
    await loginAs(page, pair, "DISTRIBUTOR");
    await page.goto("/partner/stock/intake");
    await expect(page.getByText("هذه الصفحة متاحة للوكلاء فقط")).toBeVisible();
    await page.goto("/partner/stock/intake/new");
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
        page.request.post("/api/partner/receipts", { data: { kind: "FACTORY", lines: [{ variantId: parallelVariantId, quantity: 3 }] } })
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
  });
});

test.describe("movements tab", () => {
  test.describe.configure({ mode: "serial" });
  let pair: PartnerFixturePair;
  const RUN_TAG = `e2e-5-4-movements-${Date.now()}`;
  let categoryId: string;
  let productId: string;
  let variantId: string;

  test.beforeAll(async () => {
    pair = await seedPartnerPair(prisma);
    const category = await prisma.category.create({ data: { name: `فئة حركات ${RUN_TAG}`, slug: `cat-mv-${RUN_TAG}` } });
    categoryId = category.id;
    const product = await prisma.product.create({ data: { categoryId, name: `منتج حركات ${RUN_TAG}`, slug: `mv-${RUN_TAG}`, active: true } });
    productId = product.id;
    const variant = await prisma.variant.create({
      data: { productId, sku: `SKU-MV-${RUN_TAG}`, name: "M", pricePiastres: 10000 },
    });
    variantId = variant.id;
    await prisma.partnerInventory.create({ data: { partnerId: pair.agent.partnerId, variantId, stockAvailable: 10, stockReserved: 0 } });
    // The running balance sums ledger deltas — seed the initial 10 as a ledger row too so
    // the API's running balance (which only knows what the ledger knows) matches the
    // variant's real stock history rather than a floor set directly by this fixture.
    await prisma.inventoryLedger.create({
      data: { partnerId: pair.agent.partnerId, variantId, reason: "LEGACY_BACKFILL", quantityAvailableDelta: 10, quantityReservedDelta: 0 },
    });
    // Two manual adjustments -> two MANUAL_ADJUSTMENT ledger rows, running balance 15 then 25.
    await prisma.inventoryLedger.create({
      data: { partnerId: pair.agent.partnerId, variantId, reason: "MANUAL_ADJUSTMENT", quantityAvailableDelta: 5, quantityReservedDelta: 0 },
    });
    await prisma.partnerInventory.update({ where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId } }, data: { stockAvailable: 15 } });
    await prisma.inventoryLedger.create({
      data: { partnerId: pair.agent.partnerId, variantId, reason: "STOCK_COUNT", quantityAvailableDelta: 10, quantityReservedDelta: 0 },
    });
    await prisma.partnerInventory.update({ where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId } }, data: { stockAvailable: 25 } });
  });

  test.afterAll(async () => {
    await prisma.inventoryLedger.deleteMany({ where: safeWhere({ partnerId: pair.agent.partnerId }) });
    await prisma.partnerInventory.deleteMany({ where: safeWhere({ partnerId: pair.agent.partnerId }) });
    await prisma.variant.deleteMany({ where: safeWhere({ productId }) });
    await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
    await prisma.category.delete({ where: safeWhere({ id: categoryId }) });
    await cleanupPartnerPair(prisma, pair);
    await prisma.$disconnect();
  });

  test("lists ledger rows with a running balance and filters by reason", async ({ page }) => {
    await loginAs(page, pair, "AGENT");
    await page.goto("/partner/stock/movements");
    const skuText = page.getByText(`SKU-MV-${RUN_TAG}`, { exact: false });
    await expect(skuText.first()).toBeVisible();

    const res = await page.request.get(`/api/partner/inventory/ledger?variantId=${variantId}`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    const rows = json.data.rows as { reason: string; runningBalance: number }[];
    expect(rows).toHaveLength(3);
    // Newest first: STOCK_COUNT (balance 25), MANUAL_ADJUSTMENT (balance 15), the seeded
    // LEGACY_BACKFILL floor (balance 10).
    expect(rows[0].reason).toBe("STOCK_COUNT");
    expect(rows[0].runningBalance).toBe(25);
    expect(rows[1].reason).toBe("MANUAL_ADJUSTMENT");
    expect(rows[1].runningBalance).toBe(15);
    expect(rows[2].reason).toBe("LEGACY_BACKFILL");
    expect(rows[2].runningBalance).toBe(10);

    const filtered = await page.request.get(`/api/partner/inventory/ledger?variantId=${variantId}&reason=STOCK_COUNT`);
    const filteredJson = await filtered.json();
    expect(filteredJson.data.rows).toHaveLength(1);
    expect(filteredJson.data.rows[0].reason).toBe("STOCK_COUNT");
  });
});

test.describe("requests tab (restock transfer)", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);
  let pair: PartnerFixturePair;
  let productIds: string[] = [];
  let variantA: { id: string; sku: string; productName: string };
  let variantB: { id: string; sku: string; productName: string };

  async function seedTestVariant(label: string): Promise<{ id: string; sku: string; productName: string }> {
    const category = await prisma.category.findFirst({ select: { id: true } });
    if (!category) throw new Error("Need at least one Category seeded in the redesign DB to run this spec.");
    const unique = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const productName = `منتج اختبار إعادة التوريد ${unique}`;
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        name: productName,
        slug: `restock-test-${unique}`,
        active: true,
        variants: { create: [{ sku: `RESTOCK-TEST-${unique}`, name: "M", pricePiastres: 10000 }] },
      },
      include: { variants: true },
    });
    productIds.push(product.id);
    return { id: product.variants[0].id, sku: product.variants[0].sku, productName };
  }

  test.beforeAll(async () => {
    pair = await seedPartnerPair(prisma);
    variantA = await seedTestVariant("A");
    variantB = await seedTestVariant("B");
    await prisma.partnerInventory.upsert({
      where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: variantB.id } },
      update: { stockAvailable: 50, stockReserved: 0 },
      create: { partnerId: pair.agent.partnerId, variantId: variantB.id, stockAvailable: 50, stockReserved: 0 },
    });
  });

  test.afterAll(async () => {
    await cleanupPartnerPair(prisma, pair);
    await prisma.variant.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
    await prisma.$disconnect();
  });

  test("distributor creates then cancels a request, creates another; agent sees distributor stock inline and fulfils the transfer", async ({ page }) => {
    await loginAs(page, pair, "DISTRIBUTOR");
    await page.goto("/partner/stock/requests");

    await createDraftLine(page, variantA.sku, 3);
    await page.getByRole("button", { name: "إرسال الطلب" }).click();
    await expect(page.getByText("تم إرسال طلب إعادة التوريد", { exact: true })).toBeVisible();
    const rowA = page.getByRole("row").filter({ hasText: variantA.sku });
    await expect(rowA.getByText("قيد المراجعة")).toBeVisible();

    await rowA.getByRole("button", { name: "إلغاء الطلب" }).click();
    const cancelDialog = page.getByRole("dialog");
    await expect(cancelDialog).toBeVisible();
    await cancelDialog.getByRole("button", { name: "إلغاء الطلب" }).click();
    await expect(cancelDialog).toBeHidden();
    await expect(page.getByText("تم إلغاء الطلب", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(rowA.getByText("ملغي")).toBeVisible();

    await createDraftLine(page, variantB.sku, 5);
    await page.getByRole("button", { name: "إرسال الطلب" }).click();
    await expect(page.getByText("تم إرسال طلب إعادة التوريد", { exact: true })).toBeVisible();
    const rowB = page.getByRole("row").filter({ hasText: variantB.sku });
    await expect(rowB.getByText("قيد المراجعة")).toBeVisible();

    await page.context().clearCookies();
    await loginAs(page, pair, "AGENT");
    await page.goto("/partner/stock/requests");

    const card = page.getByTestId("restock-request-card").filter({ hasText: variantB.sku });
    await expect(card).toBeVisible();
    await expect(card.getByText("متاح لدى الموزع")).toBeVisible();

    await card.getByRole("button", { name: "تنفيذ التحويل" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "إلغاء", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(card.getByText("قيد المراجعة")).toBeVisible();

    await card.getByRole("button", { name: "تنفيذ التحويل" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "تأكيد ونقل المخزون" }).click();
    await expect(page.getByText("تم تحديث طلب الموزع", { exact: true })).toBeVisible();
    await expect(card.getByText("تم التنفيذ")).toBeVisible();

    const [agentInventory, distributorInventory] = await Promise.all([
      prisma.partnerInventory.findUnique({ where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: variantB.id } } }),
      prisma.partnerInventory.findUnique({ where: { partnerId_variantId: { partnerId: pair.distributor.partnerId, variantId: variantB.id } } }),
    ]);
    expect(agentInventory?.stockAvailable).toBe(45);
    expect(distributorInventory?.stockAvailable).toBe(5);

    const restockRequest = await prisma.restockRequest.findFirst({ where: { destinationPartnerId: pair.distributor.partnerId, status: "FULFILLED" } });
    expect(restockRequest).not.toBeNull();
    const ledgerRows = await prisma.inventoryLedger.findMany({ where: { restockRequestId: restockRequest!.id, variantId: variantB.id } });
    expect(ledgerRows).toHaveLength(4);

    const cancelledRequest = await prisma.restockRequest.findFirst({ where: { destinationPartnerId: pair.distributor.partnerId, status: "CANCELLED" } });
    await prisma.restockRequestItem.deleteMany({ where: { restockRequestId: { in: [restockRequest!.id, cancelledRequest?.id ?? ""] } } });
    await prisma.restockRequest.deleteMany({ where: { id: { in: [restockRequest!.id, cancelledRequest?.id ?? ""] } } });
    await prisma.inventoryLedger.deleteMany({ where: safeWhere({ restockRequestId: restockRequest!.id }) });
    await prisma.partnerInventory.deleteMany({
      where: safeWhere({ partnerId: { in: [pair.agent.partnerId, pair.distributor.partnerId] }, variantId: variantB.id }),
    });
  });

  async function createDraftLine(page: import("@playwright/test").Page, sku: string, quantity: number) {
    await page.getByPlaceholder("بحث عن منتج أو SKU").fill(sku);
    const select = page.locator("#variant-select");
    await expect(select).toContainText(sku, { timeout: 10_000 });
    await select.selectOption({ label: (await select.locator(`option:has-text("${sku}")`).textContent()) as string });
    await page.locator("#quantity-input").fill(String(quantity));
    await page.getByRole("button", { name: "إضافة" }).click();
  }
});
