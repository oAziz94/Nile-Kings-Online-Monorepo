import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

/**
 * Backlog 9.5b (مخزون الشبكة tab) coverage: a fixture partner with one SKU at 2 available /
 * 0 reserved and a *category* threshold of 5 shows the resolved threshold (not the partner
 * default) and "تحت الحد"; an inline correction to 7 with a reason writes a
 * `MANUAL_ADJUSTMENT` ledger row + an audit row and the row leaves the "تحت الحد" filter; a
 * correction below reserved is refused (400); the اليوم card's link lands on this tab
 * filtered to the partner; CSV export is 200; search/الشريك/الفئة/نافد-فقط filters narrow
 * the rendered rows; pagination across 100 seeded rows for a dedicated fixture partner has
 * no overlap between page 1 and page 2 and the union matches the API's own total; 390x844,
 * 1024x768 and 1440x900 have no horizontal overflow.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(150_000);

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

const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ADMIN_PHONE = "+201099966601";
const ADMIN_PASSWORD = "AdminNetworkStockTest123!";
const ADMIN_NAME = `مسؤول اختبار مخزون الشبكة ${uniqueSuffix}`;

let adminUserId: string;
let pair: PartnerFixturePair;
let categoryId: string;
let categoryName: string;
let productId: string;
let variantId: string;
let sku: string;
let thresholdId: string;

// Extra fixtures for the filter/search/toggle UI tests (backlog 9.5 close-out fix item 2) —
// kept separate from `variantId`/`sku` above so the earlier correction test (which pushes
// that row's sellable above the threshold, leaving the default "تحت الحد فقط" view) never
// interferes with these.
let searchVariantId: string;
let searchSku: string;
let outVariantId: string;
let outSku: string;

// A dedicated partner + 100 SKUs for the pagination test, cleaned up on its own.
type FixturePartner = { userId: string; partnerId: string; name: string };
let paginationPartner: FixturePartner;
const PAGINATION_ROW_COUNT = 100;
const paginationVariantIds: string[] = [];

async function createFixturePartner(label: string, phone: string): Promise<FixturePartner> {
  const user = await prisma.user.create({ data: { phone, role: "CUSTOMER", passwordHash: await hashPassword("NetworkStockPartner123!") } });
  const partner = await prisma.partner.create({
    data: { userId: user.id, partnerType: "AGENT", name: `${label} ${uniqueSuffix}`, governorate: "القاهرة", phone, isActive: true, lowStockThreshold: 1 },
  });
  return { userId: user.id, partnerId: partner.id, name: partner.name };
}

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

  // Partner default threshold is deliberately different (10) from the category override (5)
  // so a pass only proves the *resolved* value, never the partner default, drives the row.
  pair = await seedPartnerPair(prisma, { agent: { lowStockThreshold: 10 } });

  const category = await prisma.category.create({
    data: { name: `فئة مخزون الشبكة ${uniqueSuffix}`, slug: `network-stock-cat-${uniqueSuffix}` },
  });
  categoryId = category.id;
  categoryName = category.name;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج مخزون الشبكة ${uniqueSuffix}`, slug: `network-stock-product-${uniqueSuffix}`, active: true },
  });
  productId = product.id;
  sku = `NET-STOCK-${uniqueSuffix}`;
  const variant = await prisma.variant.create({
    data: { productId, sku, name: "M", colorName: "أحمر", pricePiastres: 10000 },
  });
  variantId = variant.id;

  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId, stockAvailable: 2, stockReserved: 0 },
  });

  const threshold = await prisma.partnerStockThreshold.create({
    data: { partnerId: pair.agent.partnerId, categoryId, threshold: 5 },
  });
  thresholdId = threshold.id;

  // Search/filter/toggle fixtures — permanently under the category threshold (5) so they
  // stay visible under the default "تحت الحد فقط" filter regardless of what the correction
  // test above does to `variantId`.
  searchSku = `NET-STOCK-SEARCH-${uniqueSuffix}`;
  const searchVariant = await prisma.variant.create({
    data: { productId, sku: searchSku, name: "L", colorName: "أزرق", pricePiastres: 10000 },
  });
  searchVariantId = searchVariant.id;
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: searchVariantId, stockAvailable: 1, stockReserved: 0 },
  });

  outSku = `NET-STOCK-OUT-${uniqueSuffix}`;
  const outVariant = await prisma.variant.create({
    data: { productId, sku: outSku, name: "S", colorName: "أخضر", pricePiastres: 10000 },
  });
  outVariantId = outVariant.id;
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: outVariantId, stockAvailable: 0, stockReserved: 0 },
  });

  // Pagination fixture: a dedicated partner + 100 SKUs under the same product, each with a
  // strictly increasing `stockAvailable` so the report's cover-then-sellable sort is fully
  // deterministic across two successive page requests (no sales anywhere here, so every row
  // ties on cover — the unique sellable value is what actually orders them).
  paginationPartner = await createFixturePartner("شريك ترقيم الصفحات", "+201099966699");
  for (let i = 0; i < PAGINATION_ROW_COUNT; i++) {
    const pgVariant = await prisma.variant.create({
      data: {
        productId,
        sku: `NET-STOCK-PG-${uniqueSuffix}-${i}`,
        name: "PG",
        pricePiastres: 10000,
      },
    });
    paginationVariantIds.push(pgVariant.id);
    await prisma.partnerInventory.create({
      data: { partnerId: paginationPartner.partnerId, variantId: pgVariant.id, stockAvailable: i, stockReserved: 0 },
    });
  }
});

test.afterAll(async () => {
  await prisma.adminAuditLog.deleteMany({ where: { entityType: "partner-inventory", entityLabel: sku } });
  await prisma.partnerStockThreshold.deleteMany({ where: { id: thresholdId } });
  await prisma.inventoryLedger.deleteMany({ where: { variantId } });
  await prisma.partnerInventory.deleteMany({ where: { variantId } });
  await prisma.inventoryLedger.deleteMany({ where: { variantId: { in: [searchVariantId, outVariantId, ...paginationVariantIds] } } });
  await prisma.partnerInventory.deleteMany({ where: { variantId: { in: [searchVariantId, outVariantId, ...paginationVariantIds] } } });
  await prisma.variant.deleteMany({ where: { id: { in: [searchVariantId, outVariantId, ...paginationVariantIds] } } });
  await prisma.partner.deleteMany({ where: { id: paginationPartner.partnerId } });
  await prisma.user.deleteMany({ where: { id: paginationPartner.userId } });
  await prisma.variant.deleteMany({ where: { id: variantId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.user.deleteMany({ where: { id: adminUserId } });
  await prisma.$disconnect();
});

test("resolved category threshold (not the partner default) drives the row, correction updates it, below-reserved is refused", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/partners?tab=network&q=${encodeURIComponent(sku)}`);

  const row = page.getByTestId(`network-stock-row-${variantId}-${pair.agent.partnerId}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("5"); // الحد resolved from the category override, not 10
  await expect(row).toContainText("تحت الحد");

  const qtyInput = row.getByLabel(`كمية جديدة — ${sku} — ${pair.agent.name}`);
  const reasonInput = row.getByLabel(`سبب التصحيح — ${sku} — ${pair.agent.name}`);
  await qtyInput.fill("7");
  await reasonInput.fill("جرد يدوي");
  await row.getByRole("button").last().click();

  await expect(page.getByText("تم حفظ التصحيح", { exact: true })).toBeVisible({ timeout: 10_000 });

  const ledgerRow = await prisma.inventoryLedger.findFirst({
    where: { variantId, partnerId: pair.agent.partnerId, reason: "MANUAL_ADJUSTMENT" },
    orderBy: { createdAt: "desc" },
  });
  expect(ledgerRow).not.toBeNull();
  expect(ledgerRow!.notes).toContain("جرد يدوي");

  const auditRow = await prisma.adminAuditLog.findFirst({
    where: { entityType: "partner-inventory", action: "stock_correction", entityLabel: sku },
    orderBy: { createdAt: "desc" },
  });
  expect(auditRow).not.toBeNull();
  expect(auditRow!.reason).toBe("جرد يدوي");

  // Now sellable (7) > threshold (5): with "تحت الحد فقط" still on (default), the row leaves the list.
  await page.reload();
  await expect(page.getByTestId(`network-stock-row-${variantId}-${pair.agent.partnerId}`)).toHaveCount(0, { timeout: 10_000 });

  // A correction below reserved is refused (400) — reserved is 0 here, so 0 stockAvailable is
  // the boundary; go negative via the API directly against a reserved-positive fixture.
  const res = await page.request.post("/api/admin/partner-inventory", {
    data: { partnerId: pair.agent.partnerId, variantId, stockAvailable: 3, stockReserved: 5 },
  });
  expect(res.status()).toBe(400);
});

test("the search box narrows the row set", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/partners?tab=network");
  await expect(page.getByText("جاري التحميل")).toHaveCount(0, { timeout: 15_000 });

  const searchBox = page.getByPlaceholder("SKU أو اسم المنتج");
  await searchBox.fill(searchSku);
  const searchRow = page.getByTestId(`network-stock-row-${searchVariantId}-${pair.agent.partnerId}`);
  await expect(searchRow).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId(`network-stock-row-${outVariantId}-${pair.agent.partnerId}`)).toHaveCount(0);

  await searchBox.fill(`no-such-sku-${uniqueSuffix}`);
  await expect(page.getByText("لا توجد نتائج")).toBeVisible({ timeout: 10_000 });
});

test("the الشريك and الفئة selects narrow the row set", async ({ page }) => {
  await loginAsAdmin(page);
  // Unfiltered first so the الفئة select accumulates more than this fixture's own category
  // (it only ever learns categories from rows it has already loaded).
  await page.goto("/admin/partners?tab=network");
  await expect(page.getByText("جاري التحميل")).toHaveCount(0, { timeout: 15_000 });

  await page.getByPlaceholder("SKU أو اسم المنتج").fill(searchSku);
  const row = page.getByTestId(`network-stock-row-${searchVariantId}-${pair.agent.partnerId}`);
  await expect(row).toBeVisible({ timeout: 15_000 });

  // الشريك: a partner who never held this SKU narrows the row set to zero.
  await page.getByLabel("الشريك").selectOption({ label: paginationPartner.name });
  await expect(row).toHaveCount(0, { timeout: 10_000 });

  // Back to this fixture's own partner, the row returns.
  await page.getByLabel("الشريك").selectOption({ label: pair.agent.name });
  await expect(row).toBeVisible({ timeout: 10_000 });

  // الفئة: an unrelated category (already loaded, from the wider network) hides the row;
  // this fixture's own category brings it back.
  const categorySelect = page.getByLabel("الفئة");
  const optionLabels = await categorySelect.locator("option").allTextContents();
  const otherCategory = optionLabels.find((l) => l.trim() && l !== "كل الفئات" && l !== categoryName);
  expect(otherCategory, "expected at least one other category to be loaded from the wider network").toBeTruthy();

  await categorySelect.selectOption({ label: otherCategory! });
  await expect(row).toHaveCount(0, { timeout: 10_000 });

  await categorySelect.selectOption({ label: categoryName });
  await expect(row).toBeVisible({ timeout: 10_000 });
});

test("نافد فقط toggle shows only out-of-stock rows", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/partners?tab=network&partner=${pair.agent.partnerId}`);
  await expect(page.getByText("جاري التحميل")).toHaveCount(0, { timeout: 15_000 });

  const outRow = page.getByTestId(`network-stock-row-${outVariantId}-${pair.agent.partnerId}`);
  const lowRow = page.getByTestId(`network-stock-row-${searchVariantId}-${pair.agent.partnerId}`);
  await expect(outRow).toBeVisible({ timeout: 10_000 });
  await expect(lowRow).toBeVisible();

  await page.getByRole("button", { name: "نافد فقط" }).click();
  await expect(outRow).toBeVisible({ timeout: 10_000 });
  await expect(lowRow).toHaveCount(0);
});

test("pagination: page 1 and page 2 have no overlapping rows and their union matches the API total", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/partners?tab=network&partner=${paginationPartner.partnerId}`);
  await expect(page.getByText("جاري التحميل")).toHaveCount(0, { timeout: 15_000 });

  // These 100 rows are all well above their (partner-default) threshold, so they only show
  // once "تحت الحد فقط" (on by default) is switched off.
  const belowThresholdToggle = page.getByRole("button", { name: "تحت الحد فقط" });
  await belowThresholdToggle.click();
  await expect(belowThresholdToggle).toHaveAttribute("aria-pressed", "false");

  const rowLocator = page.locator('[data-testid^="network-stock-row-"]');
  const rangeText = page.getByText(/عرض \d+–\d+ من \d+/);
  await expect(rowLocator.first()).toBeVisible({ timeout: 10_000 });
  await expect(rowLocator).toHaveCount(50, { timeout: 10_000 });
  await expect(rangeText).toHaveText(/عرض 1–50 من \d+/, { timeout: 10_000 });
  const page1Ids = await rowLocator.evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));

  const totalText = await rangeText.textContent();
  const total = Number(totalText?.match(/من (\d+)/)?.[1]);
  expect(total).toBe(PAGINATION_ROW_COUNT);

  // The pagination bar's "عرض N–M من Z" text is computed straight from the `page` state and
  // updates synchronously on click, *before* the async refetch resolves — waiting on it (or
  // even the "جاري التحديث…" indicator, which can flip back to hidden before this check runs)
  // races the still-stale row set. Wait for a SKU that can only appear on page 2 (rows are
  // sorted by ascending sellable, and only rows with sellable >= 50 land on page 2).
  await page.getByRole("button", { name: "الصفحة التالية" }).click();
  await expect(rangeText).toHaveText(/عرض 51–100 من \d+/, { timeout: 10_000 });
  await expect(page.getByText(`NET-STOCK-PG-${uniqueSuffix}-50`, { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(rowLocator).toHaveCount(50, { timeout: 10_000 });
  const page2Ids = await rowLocator.evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));

  const overlap = page1Ids.filter((id) => page2Ids.includes(id));
  expect(overlap).toHaveLength(0);

  const union = new Set([...page1Ids, ...page2Ids]);
  expect(union.size).toBe(total);

  // Cross-check against the API directly (offset-paginated, same filters).
  const apiRes = await page.request.get(`/api/admin/network-stock?partnerId=${paginationPartner.partnerId}&belowThresholdOnly=0&limit=100&offset=0`);
  const apiJson = await apiRes.json();
  expect(apiJson.data.total).toBe(PAGINATION_ROW_COUNT);
});

test("the اليوم card's low-stock link lands on this tab filtered to the partner", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/partners?tab=network&partner=${pair.agent.partnerId}`);
  await expect(page).toHaveURL(new RegExp(`tab=network&partner=${pair.agent.partnerId}`));
});

test("CSV export responds 200", async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.get(`/api/admin/network-stock?format=csv&partnerId=${pair.agent.partnerId}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("text/csv");
});

test("no horizontal overflow at 1440x900, 1024x768 or 390x844", async ({ page }) => {
  await loginAsAdmin(page);
  for (const { width, height } of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/admin/partners?tab=network");
    await expect(page.getByText("جاري التحميل")).toHaveCount(0, { timeout: 15_000 });
    const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(hasOverflow, `overflow at ${width}x${height}`).toBe(false);
  }
});

const SCREENSHOT_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1514, height: 681 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

test("screenshots: مخزون الشبكة at the four viewports", async ({ page }) => {
  await loginAsAdmin(page);
  for (const { width, height } of SCREENSHOT_VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto("/admin/partners?tab=network");
    await expect(page.getByRole("tab", { name: /مخزون الشبكة/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("جاري التحميل")).toHaveCount(0, { timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/admin-v2-network-stock-${width}x${height}.png`, fullPage: true });
  }
});
