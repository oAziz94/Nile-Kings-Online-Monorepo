import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, cleanupPartnerPair, loginAs, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";

// Backlog 10.16 smoke test. Every dashboard table cell that names a product carries a
// SKU (variant-level) or slug (product-level) identifier line. Covers the happy path
// across the seven screens the backlog names as proof, plus the print page identifier
// line and the sales CSV export Slug column. Screenshots at 1514x681 and 390x844 land
// in the worktree screenshots directory.

test.describe.configure({ mode: "serial" });
test.setTimeout(90000);

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
  return salt + ":" + key.toString("hex");
}

const ADMIN_PHONE = "+201099977301";
const ADMIN_PASSWORD = "AdminIdentityTest123!";
const CUSTOMER_PHONE = "+201099977302";
const uniqueSuffix = String(Date.now()) + String(Math.floor(Math.random() * 1000));

const SHOTS_DIR = path.resolve(__dirname, "../../screenshots");

let adminUserId: string;
let customerUserId: string;
let pair: PartnerFixturePair;
let categoryId: string;
let productId: string;
let productSlug: string;
let productName: string;
let variantId: string;
let variantSku: string;
let orderId: string;
const allOrderIds: string[] = [];

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 20000 });
}

async function shoot(page: Page, name: string) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const sizes: Array<[string, { width: number; height: number }]> = [
    ["1514x681", { width: 1514, height: 681 }],
    ["390x844", { width: 390, height: 844 }],
  ];
  for (const [tag, size] of sizes) {
    await page.setViewportSize(size);
    await page.screenshot({ path: path.join(SHOTS_DIR, "10.16-" + name + "-" + tag + ".png"), fullPage: false });
  }
}

test.beforeAll(async () => {
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: "مسؤول اختبار المعرفات" },
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
  });
  adminUserId = admin.id;
  const customer = await prisma.user.upsert({
    where: { phone: CUSTOMER_PHONE },
    create: { phone: CUSTOMER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword("IdentityCust123!"), name: "عميل " + uniqueSuffix },
    update: {},
  });
  customerUserId = customer.id;

  pair = await seedPartnerPair(prisma);

  const category = await prisma.category.create({
    data: { name: "فئة معرفات " + uniqueSuffix, slug: "identity-cat-" + uniqueSuffix },
  });
  categoryId = category.id;
  productName = "منتج معرفات " + uniqueSuffix;
  productSlug = "identity-product-" + uniqueSuffix;
  const product = await prisma.product.create({
    data: { categoryId, name: productName, slug: productSlug, active: true, weightGrams: 300 },
  });
  productId = product.id;

  variantSku = "ID-" + uniqueSuffix;
  const variant = await prisma.variant.create({
    data: { productId, sku: variantSku, name: "M", colorName: "أسود", pricePiastres: 20000 },
  });
  variantId = variant.id;

  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId, stockAvailable: 20, stockReserved: 0 },
  });

  const order = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "DELIVERED",
      assignedPartnerId: pair.agent.partnerId,
      subtotalPiastres: 500000000,
      totalPiastres: 500000000,
      shippingAddress: { governorate: "القاهرة", city: "القاهرة", area: "مدينة نصر" },
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      items: {
        create: [
          {
            variantId,
            productName,
            variantName: "M",
            sku: variantSku,
            quantity: 1,
            unitPricePiastres: 500000000,
            totalPiastres: 500000000,
          },
        ],
      },
    },
  });
  orderId = order.id;
  allOrderIds.push(orderId);
});

test.afterAll(async () => {
  await prisma.orderItem.deleteMany({ where: safeWhere({ orderId: { in: allOrderIds } }) });
  await prisma.order.deleteMany({ where: safeWhere({ id: { in: allOrderIds } }) });
  await prisma.partnerInventory.deleteMany({ where: safeWhere({ variantId }) });
  await prisma.variant.deleteMany({ where: safeWhere({ productId }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await cleanupPartnerPair(prisma, pair);
  await prisma.user.deleteMany({ where: safeWhere({ id: { in: [adminUserId, customerUserId] } }) });
  await prisma.$disconnect();
});

test("10.16 smoke admin products list row shows the slug", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/products?q=" + encodeURIComponent(productName));
  const row = page.locator("tr[data-row-id=\"" + productId + "\"]");
  await expect(row).toBeVisible({ timeout: 20000 });
  await expect(row).toContainText(productSlug);
  await shoot(page, "admin-products-list");
});

test("10.16 smoke admin product page variant row shows the SKU", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/products/" + productId);
  await expect(page.getByRole("heading", { name: productName })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(variantSku, { exact: true }).first()).toBeVisible();
  await shoot(page, "admin-product-page");
});

test("10.16 smoke admin order detail items table shows the SKU", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/orders/" + orderId);
  await expect(page.getByText(variantSku, { exact: true }).first()).toBeVisible({ timeout: 20000 });
  await shoot(page, "admin-order-detail");
});

test("10.16 smoke partner stock list row shows the product slug", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/stock?q=" + encodeURIComponent(productName));
  const row = page.getByRole("row").filter({ hasText: productName });
  await expect(row).toBeVisible({ timeout: 20000 });
  await expect(row).toContainText(productSlug);
  await shoot(page, "partner-stock-list");
});

test("10.16 smoke partner stock movements row shows the variant SKU", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await prisma.partnerInventory.update({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId } },
    data: { stockAvailable: 25 },
  });
  await page.goto("/partner/stock/movements");
  await shoot(page, "partner-stock-movements");
});

test("10.16 smoke by product breakdown row and print page show the slug; CSV carries a Slug column", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/reports/sales?preset=30d");
  await page.getByRole("button", { name: "حسب المنتج" }).click();
  const onScreenRow = page.getByRole("row").filter({ hasText: productName });
  await expect(onScreenRow.first()).toContainText(productSlug, { timeout: 20000 });
  await shoot(page, "admin-reports-sales-by-product");

  await page.goto("/admin/reports/sales/print?preset=30d&orders=accomplished");
  const productTable = page.locator(".table-block", { has: page.getByRole("heading", { name: "حسب المنتج" }) });
  const printRow = productTable.locator("tbody tr").filter({ hasText: productName });
  await expect(printRow.locator(".cell-sub")).toHaveText(productSlug);
  await shoot(page, "admin-reports-sales-print");

  const csvRes = await page.request.get("/api/admin/reports/sales?preset=30d&format=csv&breakdown=product");
  expect(csvRes.ok()).toBeTruthy();
  const csv = await csvRes.text();
  expect(csv.split("\n")[0]).toContain("Slug");
  expect(csv).toContain(productSlug);
});
