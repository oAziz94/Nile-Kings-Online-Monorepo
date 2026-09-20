import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { deleteByIds } from "./db-cleanup";

/**
 * Backlog 10.30 — favicon + descriptive tab titles.
 *
 * Every row this file creates is fixture data under its own unique suffix, cleaned up in
 * `afterAll` (order items → order → variant → product → category → users), never a shared
 * or production row. `nk-8888` (the PDP check) is the standing, PM-confirmed, real/active
 * fixture product also used by `tests/e2e/image-fit.spec.ts` — read-only here, its name is
 * only read to build the expected title, never modified.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

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

const ADMIN_PHONE = "+201099955420";
const ADMIN_PASSWORD = "TabTitlesAdmin123!";
const PARTNER_PHONE = "+201099955421";
const PARTNER_PASSWORD = "TabTitlesPartner123!";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

let adminUserId: string;
let partnerUserId: string;
let partnerId: string;
let categoryId: string;
let productId: string;
let variantId: string;
let orderId: string;
let orderItemId: string;

async function apiLoginAsAdmin(page: Page) {
  const res = await page.request.post("/api/auth/login", { data: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD } });
  expect(res.ok()).toBeTruthy();
}
async function apiLoginAsPartner(page: Page) {
  const res = await page.request.post("/api/auth/login", { data: { phone: PARTNER_PHONE, password: PARTNER_PASSWORD } });
  expect(res.ok()).toBeTruthy();
}

test.beforeAll(async () => {
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: "مسؤول اختبار العناوين" },
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
  });
  adminUserId = admin.id;

  const partnerUser = await prisma.user.upsert({
    where: { phone: PARTNER_PHONE },
    create: { phone: PARTNER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword(PARTNER_PASSWORD), name: "شريك اختبار العناوين" },
    update: { passwordHash: await hashPassword(PARTNER_PASSWORD) },
  });
  partnerUserId = partnerUser.id;

  const partner = await prisma.partner.create({
    data: {
      userId: partnerUserId,
      partnerType: "AGENT",
      name: `شريك اختبار العناوين ${uniqueSuffix}`,
      governorate: "القاهرة",
      phone: PARTNER_PHONE,
      isActive: true,
    },
  });
  partnerId = partner.id;

  const category = await prisma.category.create({
    data: { name: `فئة عناوين ${uniqueSuffix}`, slug: `tab-titles-cat-${uniqueSuffix}` },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: { categoryId, name: `منتج عناوين ${uniqueSuffix}`, slug: `tab-titles-product-${uniqueSuffix}`, active: true, weightGrams: 300 },
  });
  productId = product.id;

  const variant = await prisma.variant.create({
    data: { productId, sku: `TT-${uniqueSuffix}`, name: "M", colorName: "أزرق", pricePiastres: 15000 },
  });
  variantId = variant.id;

  const order = await prisma.order.create({
    data: {
      userId: partnerUserId,
      status: "CREATED",
      subtotalPiastres: 15000,
      totalPiastres: 15000,
      shippingAddress: { governorate: "القاهرة", city: "القاهرة", area: "مدينة نصر", street: "شارع الاختبار" },
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      items: {
        create: [
          {
            variantId,
            productName: product.name,
            variantName: `${product.slug}-${variant.sku}`,
            sku: variant.sku,
            quantity: 1,
            unitPricePiastres: 15000,
            totalPiastres: 15000,
          },
        ],
      },
    },
    include: { items: true },
  });
  orderId = order.id;
  orderItemId = order.items[0].id;
});

test.afterAll(async () => {
  await deleteByIds(prisma.orderItem, [orderItemId]);
  await deleteByIds(prisma.order, [orderId]);
  await deleteByIds(prisma.variant, [variantId]);
  await deleteByIds(prisma.product, [productId]);
  await deleteByIds(prisma.category, [categoryId]);
  await deleteByIds(prisma.partner, [partnerId]);
  await deleteByIds(prisma.user, [adminUserId, partnerUserId]);
  await prisma.$disconnect();
});

const SITE_NAME = "قطن ملوك النيل";

async function expectIconLinkOk(page: Page) {
  const href = await page.locator('link[rel="icon"]').first().getAttribute("href");
  expect(href).toBeTruthy();
  const res = await page.request.get(href!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"] ?? "").toContain("image");
}

test("homepage title", async ({ page }) => {
  // The homepage's own page.tsx sets an explicit "الرئيسية" title (pre-existing, outside
  // 10.30's scope) — templated by the root layout into "الرئيسية · قطن ملوك النيل". The bare
  // site name is the root layout's *default*, used only where no page/layout overrides it
  // (e.g. a 404).
  await page.goto("/");
  await expect(page).toHaveTitle(`الرئيسية · ${SITE_NAME}`);
  await expectIconLinkOk(page);
});

test("product page title is the product name", async ({ page }) => {
  const product = await prisma.product.findUnique({ where: { slug: "nk-8888" }, select: { name: true } });
  expect(product).toBeTruthy();
  await page.goto("/products/nk-8888");
  await expect(page).toHaveTitle(`${product!.name} · ${SITE_NAME}`);
});

test("cart page title", async ({ page }) => {
  await page.goto("/cart");
  await expect(page).toHaveTitle(`السلة · ${SITE_NAME}`);
});

test("login page title", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveTitle(`تسجيل الدخول · ${SITE_NAME}`);
});

test("admin dashboard title", async ({ page }) => {
  await apiLoginAsAdmin(page);
  await page.goto("/admin");
  await expect(page).toHaveTitle("لوحة الإدارة · قطن ملوك النيل");
  await expectIconLinkOk(page);
});

test("admin orders list title", async ({ page }) => {
  await apiLoginAsAdmin(page);
  await page.goto("/admin/orders");
  await expect(page).toHaveTitle("الطلبات · لوحة الإدارة");
});

test("admin order detail title", async ({ page }) => {
  await apiLoginAsAdmin(page);
  await page.goto(`/admin/orders/${orderId}`);
  await expect(page).toHaveTitle(`طلب #${orderId.slice(0, 8)} · لوحة الإدارة`);
});

test("admin products list title", async ({ page }) => {
  await apiLoginAsAdmin(page);
  await page.goto("/admin/products");
  await expect(page).toHaveTitle("المنتجات · لوحة الإدارة");
});

test("partner dashboard title", async ({ page }) => {
  await apiLoginAsPartner(page);
  await page.goto("/partner");
  await expect(page).toHaveTitle("لوحة الشريك · قطن ملوك النيل");
});

test("partner orders list title", async ({ page }) => {
  await apiLoginAsPartner(page);
  await page.goto("/partner/orders");
  await expect(page).toHaveTitle("الطلبات · لوحة الشريك");
});

test("partner stock title", async ({ page }) => {
  await apiLoginAsPartner(page);
  await page.goto("/partner/stock");
  await expect(page).toHaveTitle("المخزون · لوحة الشريك");
});
