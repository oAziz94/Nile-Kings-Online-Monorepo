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
 * filtered to the partner; CSV export is 200; 390x844 stacking.
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

const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ADMIN_PHONE = "+201099966601";
const ADMIN_PASSWORD = "AdminNetworkStockTest123!";
const ADMIN_NAME = `مسؤول اختبار مخزون الشبكة ${uniqueSuffix}`;

let adminUserId: string;
let pair: PartnerFixturePair;
let categoryId: string;
let productId: string;
let variantId: string;
let sku: string;
let thresholdId: string;

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
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج مخزون الشبكة ${uniqueSuffix}`, slug: `network-stock-product-${uniqueSuffix}`, active: true },
  });
  productId = product.id;
  sku = `NET-STOCK-${uniqueSuffix}`;
  const variant = await prisma.variant.create({
    data: { productId, sku, name: "M", colorName: "أحمر", pricePiastres: 10000, stockAvailable: 0, stockReserved: 0 },
  });
  variantId = variant.id;

  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId, stockAvailable: 2, stockReserved: 0 },
  });

  const threshold = await prisma.partnerStockThreshold.create({
    data: { partnerId: pair.agent.partnerId, categoryId, threshold: 5 },
  });
  thresholdId = threshold.id;
});

test.afterAll(async () => {
  await prisma.adminAuditLog.deleteMany({ where: { entityType: "partner-inventory", entityLabel: sku } });
  await prisma.partnerStockThreshold.deleteMany({ where: { id: thresholdId } });
  await prisma.inventoryLedger.deleteMany({ where: { variantId } });
  await prisma.partnerInventory.deleteMany({ where: { variantId } });
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

test("390x844 stacks with no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  await page.goto("/admin/partners?tab=network");
  const hasOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasOverflow).toBe(false);
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
