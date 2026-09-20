import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 10.21 — variant thumbnails on order line items, click to enlarge.
 * Covers: admin order detail, partner order detail (as the AGENT the order is assigned
 * to), and the admin picking-list print page. Serial mode, one shared fixture set.
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

const ADMIN_PHONE = "+201099955492";
const ADMIN_PASSWORD = "AdminThumbsTest123!";
const ADMIN_NAME = "مسؤول اختبار الصور المصغرة";
const CUSTOMER_PHONE = "+201099955493";

// Real, existing Cloudinary assets on the project's account (also used by public-pdp.spec.ts).
const VARIANT_IMAGE_URL =
  "https://res.cloudinary.com/dw2yigxcp/image/upload/v1773321245/nile-kings/products/xtznkqr6zj5zi799utum.jpg";
const PRODUCT_IMAGE_URL =
  "https://res.cloudinary.com/dw2yigxcp/image/upload/v1773324600/nile-kings/products/xiwrxjqselhf0oiw5atg.jpg";

const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

let adminUserId: string;
let customerUserId: string;
let pair: PartnerFixturePair;

let categoryId: string;
let productWithImageId: string;
let productNoImageId: string;
let variantAId: string; // own imageUrl
let variantASku: string;
let variantAName: string;
let variantBId: string; // no own image -> falls back to product image
let variantBSku: string;
let variantBName: string;
let variantCId: string; // product has no image either -> placeholder
let variantCSku: string;
let variantCName: string;
let productWithImageName: string;
let productNoImageName: string;

let orderId: string;

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

  const customer = await prisma.user.upsert({
    where: { phone: CUSTOMER_PHONE },
    create: { phone: CUSTOMER_PHONE, role: "CUSTOMER", name: `عميل اختبار الصور ${uniqueSuffix}` },
    update: {},
  });
  customerUserId = customer.id;

  pair = await seedPartnerPair(prisma);

  const category = await prisma.category.create({
    data: { name: `فئة صور مصغرة ${uniqueSuffix}`, slug: `order-thumbs-cat-${uniqueSuffix}` },
  });
  categoryId = category.id;

  productWithImageName = `منتج بصورة ${uniqueSuffix}`;
  const productWithImage = await prisma.product.create({
    data: {
      categoryId,
      name: productWithImageName,
      slug: `order-thumbs-product-with-image-${uniqueSuffix}`,
      active: true,
      weightGrams: 300,
      imageUrl: PRODUCT_IMAGE_URL,
    },
  });
  productWithImageId = productWithImage.id;

  productNoImageName = `منتج بلا صورة ${uniqueSuffix}`;
  const productNoImage = await prisma.product.create({
    data: {
      categoryId,
      name: productNoImageName,
      slug: `order-thumbs-product-no-image-${uniqueSuffix}`,
      active: true,
      weightGrams: 300,
      imageUrl: null,
    },
  });
  productNoImageId = productNoImage.id;

  variantAName = "L-أحمر";
  const variantA = await prisma.variant.create({
    data: {
      productId: productWithImageId,
      sku: `OT-A-${uniqueSuffix}`,
      name: "L",
      colorName: "أحمر",
      pricePiastres: 20000,
      imageUrl: VARIANT_IMAGE_URL,
    },
  });
  variantAId = variantA.id;
  variantASku = variantA.sku;

  variantBName = "M-أزرق";
  const variantB = await prisma.variant.create({
    data: {
      productId: productWithImageId,
      sku: `OT-B-${uniqueSuffix}`,
      name: "M",
      colorName: "أزرق",
      pricePiastres: 18000,
      imageUrl: null,
    },
  });
  variantBId = variantB.id;
  variantBSku = variantB.sku;

  variantCName = "S-أخضر";
  const variantC = await prisma.variant.create({
    data: {
      productId: productNoImageId,
      sku: `OT-C-${uniqueSuffix}`,
      name: "S",
      colorName: "أخضر",
      pricePiastres: 15000,
      imageUrl: null,
    },
  });
  variantCId = variantC.id;
  variantCSku = variantC.sku;

  await prisma.partnerInventory.createMany({
    data: [
      { partnerId: pair.agent.partnerId, variantId: variantAId, stockAvailable: 10, stockReserved: 1 },
      { partnerId: pair.agent.partnerId, variantId: variantBId, stockAvailable: 10, stockReserved: 1 },
      { partnerId: pair.agent.partnerId, variantId: variantCId, stockAvailable: 10, stockReserved: 1 },
    ],
  });

  const shippingAddress = { governorate: "القاهرة", city: "القاهرة", area: "مدينة نصر", street: "شارع الاختبار" };

  const order = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "CONFIRMED",
      assignedPartnerId: pair.agent.partnerId,
      subtotalPiastres: 53000,
      totalPiastres: 53000,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      items: {
        create: [
          {
            variantId: variantAId,
            productName: productWithImageName,
            variantName: variantAName,
            sku: variantASku,
            quantity: 1,
            unitPricePiastres: 20000,
            totalPiastres: 20000,
          },
          {
            variantId: variantBId,
            productName: productWithImageName,
            variantName: variantBName,
            sku: variantBSku,
            quantity: 1,
            unitPricePiastres: 18000,
            totalPiastres: 18000,
          },
          {
            variantId: variantCId,
            productName: productNoImageName,
            variantName: variantCName,
            sku: variantCSku,
            quantity: 1,
            unitPricePiastres: 15000,
            totalPiastres: 15000,
          },
        ],
      },
    },
  });
  orderId = order.id;

  await prisma.routedOrder.create({
    data: { orderId, governorate: "القاهرة", partnerId: pair.agent.partnerId, assignmentMode: "MANUAL", status: "ASSIGNED" },
  });
});

test.afterAll(async () => {
  await prisma.inventoryLedger.deleteMany({ where: safeWhere({ orderId }) });
  await prisma.orderAuditLog.deleteMany({ where: safeWhere({ orderId }) });
  await prisma.routedOrder.deleteMany({ where: safeWhere({ orderId }) });
  await prisma.orderItem.deleteMany({ where: safeWhere({ orderId }) });
  await prisma.order.deleteMany({ where: safeWhere({ id: orderId }) });
  await cleanupPartnerPair(prisma, pair);
  await prisma.variant.deleteMany({ where: safeWhere({ id: { in: [variantAId, variantBId, variantCId] } }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: { in: [productWithImageId, productNoImageId] } }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await prisma.user.deleteMany({ where: safeWhere({ id: { in: [adminUserId, customerUserId] } }) });
  await prisma.$disconnect();
});

function rowBySku(page: Page, sku: string) {
  return page.locator("table tbody tr").filter({ hasText: sku });
}

test("admin order detail: three line items render the expected thumbnail sources", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByText("الشريك المنفّذ")).toBeVisible({ timeout: 20_000 });

  const rowA = rowBySku(page, variantASku);
  const rowB = rowBySku(page, variantBSku);
  const rowC = rowBySku(page, variantCSku);

  await expect(rowA.locator("img")).toHaveAttribute("src", VARIANT_IMAGE_URL);
  await expect(rowA.getByRole("button")).toBeVisible();

  await expect(rowB.locator("img")).toHaveAttribute("src", PRODUCT_IMAGE_URL);
  await expect(rowB.getByRole("button")).toBeVisible();

  await expect(rowC.locator("img")).toHaveCount(0);
  await expect(rowC.getByRole("button")).toHaveCount(0);
  await expect(rowC.locator('[aria-hidden="true"]')).toBeVisible();
});

test("admin order detail: the editable \"تعديل بنود الطلب\" table also renders the three thumbnail sources", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByText("الشريك المنفّذ")).toBeVisible({ timeout: 20_000 });

  const editableTable = page.getByText("تعديل بنود الطلب", { exact: true }).locator("xpath=following::table[1]");
  const rowA = editableTable.locator("tbody tr").filter({ hasText: variantAName });
  const rowB = editableTable.locator("tbody tr").filter({ hasText: variantBName });
  const rowC = editableTable.locator("tbody tr").filter({ hasText: variantCName });

  await expect(rowA.locator("img")).toHaveAttribute("src", VARIANT_IMAGE_URL);
  await expect(rowB.locator("img")).toHaveAttribute("src", PRODUCT_IMAGE_URL);
  await expect(rowC.locator("img")).toHaveCount(0);
  await expect(rowC.locator('[aria-hidden="true"]')).toBeVisible();
});

test("admin order detail: click opens the dialog, Escape / X / outside-click each close it", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByText("الشريك المنفّذ")).toBeVisible({ timeout: 20_000 });

  const rowA = rowBySku(page, variantASku);
  const thumbButton = rowA.getByRole("button", { name: productWithImageName });

  // Escape closes.
  await thumbButton.click();
  const dialog = page.locator("div.fixed.inset-0.z-\\[200\\]");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: `${productWithImageName} – ${variantAName}` })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // X button closes.
  await thumbButton.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "إغلاق" }).click();
  await expect(dialog).toBeHidden();

  // Click outside (the overlay itself) closes.
  await thumbButton.click();
  await expect(dialog).toBeVisible();
  await dialog.click({ position: { x: 5, y: 5 } });
  await expect(dialog).toBeHidden();
});

test("partner order detail (agent): same three-src assertion and one open/close", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/orders/${orderId}`);
  await expect(page.getByText("القطع (3)")).toBeVisible({ timeout: 20_000 });

  const rowA = rowBySku(page, variantASku);
  const rowB = rowBySku(page, variantBSku);
  const rowC = rowBySku(page, variantCSku);

  await expect(rowA.locator("img")).toHaveAttribute("src", VARIANT_IMAGE_URL);
  await expect(rowB.locator("img")).toHaveAttribute("src", PRODUCT_IMAGE_URL);
  await expect(rowC.locator("img")).toHaveCount(0);
  await expect(rowC.locator('[aria-hidden="true"]')).toBeVisible();

  const thumbButton = rowA.getByRole("button", { name: productWithImageName });
  const dialog = page.locator("div.fixed.inset-0.z-\\[200\\]");
  await thumbButton.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: `${productWithImageName} – ${variantAName}` })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("admin picking-list print page: thumbnails render under print media", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/orders/picking?ids=${orderId}`);
  await expect(page.locator("table")).toBeVisible({ timeout: 20_000 });
  await page.emulateMedia({ media: "print" });

  const rowA = page.locator("table tbody tr").filter({ hasText: variantASku });
  const rowB = page.locator("table tbody tr").filter({ hasText: variantBSku });
  const rowC = page.locator("table tbody tr").filter({ hasText: variantCSku });

  await expect(rowA.locator("img")).toBeVisible();
  await expect(rowA.locator("img")).toHaveAttribute("src", VARIANT_IMAGE_URL);
  await expect(rowB.locator("img")).toBeVisible();
  await expect(rowB.locator("img")).toHaveAttribute("src", PRODUCT_IMAGE_URL);
  await expect(rowC.locator("img")).toHaveCount(0);
  await expect(rowC.locator('[aria-hidden="true"]')).toBeVisible();

  // Not clickable on the print page.
  await expect(rowA.getByRole("button")).toHaveCount(0);
});

test("partner pick-list print page: thumbnails render under print media", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto(`/partner/orders/pick-list?ids=${orderId}`);
  await expect(page.locator("table")).toBeVisible({ timeout: 20_000 });
  await page.emulateMedia({ media: "print" });

  const rowA = page.locator("table tbody tr").filter({ hasText: variantASku });
  const rowB = page.locator("table tbody tr").filter({ hasText: variantBSku });
  const rowC = page.locator("table tbody tr").filter({ hasText: variantCSku });

  await expect(rowA.locator("img")).toBeVisible();
  await expect(rowA.locator("img")).toHaveAttribute("src", VARIANT_IMAGE_URL);
  await expect(rowB.locator("img")).toBeVisible();
  await expect(rowB.locator("img")).toHaveAttribute("src", PRODUCT_IMAGE_URL);
  await expect(rowC.locator("img")).toHaveCount(0);
  await expect(rowC.locator('[aria-hidden="true"]')).toBeVisible();

  // Not clickable on the print page.
  await expect(rowA.getByRole("button")).toHaveCount(0);
});

const SCREENSHOT_VIEWPORTS = [
  { width: 1514, height: 681 },
  { width: 390, height: 844 },
];

test("screenshots: admin order detail at desktop and mobile viewports", async ({ page }) => {
  await loginAsAdmin(page);
  for (const { width, height } of SCREENSHOT_VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto(`/admin/orders/${orderId}`);
    await expect(page.getByText("الشريك المنفّذ")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/order-item-thumbnails-admin-${width}x${height}.png`, fullPage: true });
  }
});

test("screenshots: partner order detail at desktop and mobile viewports", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  for (const { width, height } of SCREENSHOT_VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto(`/partner/orders/${orderId}`);
    await expect(page.getByText("القطع (3)")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test-results/order-item-thumbnails-partner-${width}x${height}.png`, fullPage: true });
  }
});
