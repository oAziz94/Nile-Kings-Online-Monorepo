import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { buildVariantSku, variantSlug } from "@/lib/admin/slug";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 9.8b coverage: the product page rebuilt around colours and sizes (colour creation
 * with generated SKU/slug, second colour, inline gallery add/reorder, hero, size price, colour
 * visibility hides the storefront colour and its facets, the explicit representative image with
 * its audit rows and keyboard-reachable gallery controls), bulk edit with preview + audit rows, the additive
 * stock guard on the variant PATCH, export-excel, 401/403, and a mobile screenshot.
 *
 * Every row this file creates is fixture data under its own unique suffix, cleaned up in
 * `afterAll` — no shared/production rows are ever touched (see `test-env.ts`'s guard).
 */

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

const ADMIN_PHONE = "+201099955401";
const ADMIN_PASSWORD = "AdminCatalogTest123!";
const CUSTOMER_PHONE = "+201099955402";
const CUSTOMER_PASSWORD = "AdminCatalogCust123!";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

let adminUserId: string;
let customerUserId: string;
let categoryId: string;
let productId: string;
let productSlug: string;
let productName: string;

// Two extra products for the bulk-edit test — untouched by the colour/gallery tests above so
// the +10% price math is easy to assert.
let bulkProductAId: string;
let bulkProductBId: string;
let bulkVariantAId: string;
let bulkVariantBId: string;

async function apiLoginAsAdmin(page: Page) {
  const res = await page.request.post("/api/auth/login", { data: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD } });
  expect(res.ok()).toBeTruthy();
}
async function apiLoginAsCustomer(page: Page) {
  const res = await page.request.post("/api/auth/login", { data: { phone: CUSTOMER_PHONE, password: CUSTOMER_PASSWORD } });
  expect(res.ok()).toBeTruthy();
}
async function loginAsAdminUi(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 25_000 });
}

test.beforeAll(async () => {
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: "مسؤول اختبار الكتالوج" },
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
  });
  adminUserId = admin.id;

  const customer = await prisma.user.upsert({
    where: { phone: CUSTOMER_PHONE },
    create: { phone: CUSTOMER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword(CUSTOMER_PASSWORD) },
    update: { passwordHash: await hashPassword(CUSTOMER_PASSWORD), role: "CUSTOMER" },
  });
  customerUserId = customer.id;

  const category = await prisma.category.create({
    data: { name: `فئة اختبار الكتالوج ${uniqueSuffix}`, slug: `catalog-test-cat-${uniqueSuffix}`, sortOrder: 0 },
  });
  categoryId = category.id;

  const bulkA = await prisma.product.create({
    data: {
      categoryId,
      name: `منتج تعديل جماعي أ ${uniqueSuffix}`,
      slug: `bulk-a-${uniqueSuffix}`,
      active: true,
      variants: { create: [{ sku: `BULK-A-${uniqueSuffix}`, slug: `bulk-a-${uniqueSuffix}_m_noc`, name: "M", pricePiastres: 13300, basePricePiastres: 15000 }] },
    },
    include: { variants: true },
  });
  bulkProductAId = bulkA.id;
  bulkVariantAId = bulkA.variants[0].id;

  const bulkB = await prisma.product.create({
    data: {
      categoryId,
      name: `منتج تعديل جماعي ب ${uniqueSuffix}`,
      slug: `bulk-b-${uniqueSuffix}`,
      active: true,
      variants: { create: [{ sku: `BULK-B-${uniqueSuffix}`, slug: `bulk-b-${uniqueSuffix}_l_noc`, name: "L", pricePiastres: 9900, basePricePiastres: null }] },
    },
    include: { variants: true },
  });
  bulkProductBId = bulkB.id;
  bulkVariantBId = bulkB.variants[0].id;
});

test.afterAll(async () => {
  // Guarded cleanup — never pass a possibly-undefined id to a Prisma filter (Prisma drops an
  // `undefined` value from a `where` clause entirely, which would turn e.g. `{ id: categoryId }`
  // into `{}` and match every row of that model if `beforeAll` failed before assigning it).
  const productIds = [productId, bulkProductAId, bulkProductBId].filter((id): id is string => Boolean(id));
  if (productIds.length > 0) {
    await prisma.adminAuditLog.deleteMany({ where: { entityId: { in: productIds } } });
    await prisma.variantImage.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.variant.deleteMany({ where: { productId: { in: productIds } } });
    await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  }
  if (categoryId) await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  const userIds = [adminUserId, customerUserId].filter((id): id is string => Boolean(id));
  if (userIds.length > 0) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test("create a product, then a colour with three sizes -> three variants with generated SKUs/slugs", async ({ page }) => {
  await apiLoginAsAdmin(page);
  productName = `منتج اختبار الكتالوج ${uniqueSuffix}`;
  productSlug = `catalog-test-product-${uniqueSuffix}`;
  const createRes = await page.request.post("/api/admin/products", {
    data: { name: productName, slug: productSlug, categoryId, active: true },
  });
  expect(createRes.ok()).toBeTruthy();
  const created = (await createRes.json()).data;
  productId = created.id;

  const colorRes = await page.request.post(`/api/admin/products/${productId}/colors`, {
    data: { colorName: "أسود", colorHex: "#000000", sizes: ["S", "M", "L"], pricePiastres: 10000, basePricePiastres: 12000 },
  });
  expect(colorRes.ok()).toBeTruthy();
  const variants = (await colorRes.json()).data as { id: string; sku: string; slug: string; name: string }[];
  expect(variants).toHaveLength(3);
  for (const v of variants) {
    expect(v.sku).toBe(buildVariantSku(productSlug, v.name, "أسود", "#000000"));
    expect(v.slug).toBe(variantSlug(productSlug, v.name, "#000000"));
  }

  const audit = await prisma.adminAuditLog.findFirst({ where: { entityId: productId, action: "color_add" }, orderBy: { createdAt: "desc" } });
  expect(audit).toBeTruthy();
});

test("add a second colour to the same product", async ({ page }) => {
  await apiLoginAsAdmin(page);
  const res = await page.request.post(`/api/admin/products/${productId}/colors`, {
    data: { colorName: "أبيض", colorHex: "#ffffff", sizes: ["S", "M"], pricePiastres: 10500 },
  });
  expect(res.ok()).toBeTruthy();
  const variants = (await res.json()).data as { id: string }[];
  expect(variants).toHaveLength(2);

  const all = await prisma.variant.findMany({ where: { productId } });
  expect(all).toHaveLength(5); // 3 black + 2 white
});

test("upload/assign three images to the black colour and reorder -> PDP gallery order matches", async ({ page }) => {
  await apiLoginAsAdmin(page);
  const colorKey = "أسود|#000000";
  // Register three fake assets directly (Cloudinary credentials aren't required for this
  // assertion — only the DB ordering and the PDP's read of VariantImage matter here).
  const assets = await Promise.all(
    [1, 2, 3].map((n) =>
      prisma.mediaAsset.create({
        data: {
          publicId: `nile-kings/products/e2e-catalog-${uniqueSuffix}-${n}`,
          url: `https://res.cloudinary.com/demo/image/upload/e2e-catalog-${uniqueSuffix}-${n}.png`,
          folder: "products",
          uploadedByUserId: adminUserId,
        },
      })
    )
  );
  const assignRes = await page.request.post("/api/admin/media/assign", {
    data: { assetIds: assets.map((a) => a.id), productId, colorKey },
  });
  expect(assignRes.ok()).toBeTruthy();

  const before = await prisma.variantImage.findMany({ where: { productId, colorKey }, orderBy: { sortOrder: "asc" } });
  expect(before.map((b) => b.assetId)).toEqual(assets.map((a) => a.id));

  // Reorder: reverse the three.
  const reversedIds = before.map((b) => b.id).reverse();
  const reorderRes = await page.request.patch(`/api/admin/products/${productId}/gallery/reorder`, {
    data: { colorKey, orderedImageIds: reversedIds },
  });
  expect(reorderRes.ok()).toBeTruthy();

  const after = await prisma.variantImage.findMany({ where: { productId, colorKey }, orderBy: { sortOrder: "asc" } });
  expect(after.map((a) => a.id)).toEqual(reversedIds);

  // Gallery membership only — the colour's card/cart representative image
  // (`Variant.imageUrl`/`imageAssetId`) is a distinct concept set via "تعيين كصورة رئيسية"
  // (hero) or the pre-existing per-variant image field, never auto-derived from the gallery
  // (verified against `admin-v2-media.spec.ts`'s hero test, which would otherwise regress).
  const blackVariants = await prisma.variant.findMany({ where: { productId, colorName: "أسود" } });
  expect(blackVariants.length).toBeGreaterThan(0);
});

test("set hero -> storefront card shows it", async ({ page }) => {
  await apiLoginAsAdmin(page);
  const asset = await prisma.mediaAsset.create({
    data: {
      publicId: `nile-kings/products/e2e-catalog-hero-${uniqueSuffix}`,
      url: `https://res.cloudinary.com/demo/image/upload/e2e-catalog-hero-${uniqueSuffix}.png`,
      folder: "products",
      uploadedByUserId: adminUserId,
    },
  });
  const res = await page.request.post("/api/admin/media/hero", { data: { assetId: asset.id, productId } });
  expect(res.ok()).toBeTruthy();

  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  expect(product.heroAssetId).toBe(asset.id);
  expect(product.imageUrl).toBe(asset.url);
});

test("set a colour's representative image from its gallery -> the storefront colour image is it; clear -> falls back to the hero; both audited", async ({ page }) => {
  // Backlog 9.8b review fix 1 (PM ruling): the representative image is an explicit choice —
  // the second gallery photo is picked on purpose so gallery order can never explain the result.
  await apiLoginAsAdmin(page);
  const colorKey = "أسود|#000000";
  const images = await prisma.variantImage.findMany({ where: { productId, colorKey }, orderBy: { sortOrder: "asc" } });
  expect(images).toHaveLength(3);
  const chosen = images[1];

  const setRes = await page.request.patch(
    `/api/admin/products/${productId}/colors/${encodeURIComponent(colorKey)}/representative`,
    { data: { variantImageId: chosen.id } }
  );
  expect(setRes.ok()).toBeTruthy();

  const black = await prisma.variant.findMany({ where: { productId, colorName: "أسود" } });
  expect(black).toHaveLength(3);
  expect(black.every((v) => v.imageAssetId === chosen.assetId && v.imageUrl === chosen.url)).toBeTruthy();
  const white = await prisma.variant.findMany({ where: { productId, colorName: "أبيض" } });
  expect(white.every((v) => v.imageAssetId === null)).toBeTruthy();

  // The storefront reads the colour's image off the variant (`v.imageUrl ?? product.imageUrl`).
  const pub = await page.request.get(`/api/products/${productSlug}`);
  expect(pub.ok()).toBeTruthy();
  const pubBody = (await pub.json()).data as { imageUrl: string | null; variants: { colorName: string | null; imageUrl: string | null }[] };
  expect(pubBody.variants.filter((v) => v.colorName === "أسود").every((v) => v.imageUrl === chosen.url)).toBeTruthy();

  // A gallery photo that is not this colour's -> 400, nothing written.
  const badRes = await page.request.patch(
    `/api/admin/products/${productId}/colors/${encodeURIComponent(colorKey)}/representative`,
    { data: { variantImageId: "not-a-real-image-id" } }
  );
  expect(badRes.status()).toBe(400);

  // The admin page: gold ring on the chosen thumbnail, star states, keyboard reorder buttons.
  // Already signed in through the API above (the request context shares the page's cookies).
  await page.goto(`/admin/products/${productId}`);
  await expect(page.getByRole("heading", { name: productName })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "أسود", exact: true }).click();
  await expect(page.getByRole("button", { name: "هذه هي الصورة التمثيلية للون" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "تعيين كصورة تمثيلية للون" })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "نقل الصورة للأعلى في الترتيب" })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "نقل الصورة للأسفل في الترتيب" })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "إزالة الصورة" })).toHaveCount(3);
  await expect(page.getByRole("listitem", { name: /الصورة التمثيلية الحالية/ })).toHaveCount(1);

  // Clear it from the page -> the caption says the card falls back to the product image.
  await page.getByRole("button", { name: "إزالة", exact: true }).click();
  await expect(page.getByText("لا صورة تمثيلية — البطاقة تعرض صورة المنتج")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "هذه هي الصورة التمثيلية للون" })).toHaveCount(0);

  const cleared = await prisma.variant.findMany({ where: { productId, colorName: "أسود" } });
  expect(cleared.every((v) => v.imageAssetId === null && v.imageUrl === null)).toBeTruthy();
  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  const pub2 = (await (await page.request.get(`/api/products/${productSlug}`)).json()).data as typeof pubBody;
  expect(pub2.imageUrl).toBe(product.imageUrl); // the hero set in the previous test
  expect(pub2.variants.filter((v) => v.colorName === "أسود").every((v) => v.imageUrl === null)).toBeTruthy();

  const audits = await prisma.adminAuditLog.findMany({ where: { entityId: productId, action: "color_representative" }, orderBy: { createdAt: "asc" } });
  expect(audits).toHaveLength(2);
  const first = audits[0].after as { imageAssetId: string | null; colorName: string };
  const last = audits[1].after as { imageAssetId: string | null; colorName: string };
  expect(first.imageAssetId).toBe(chosen.assetId);
  expect(first.colorName).toBe("أسود");
  expect(last.imageAssetId).toBeNull();
  expect(last.colorName).toBe("أسود");
});

test("edit a size price -> PDP price reflects it", async ({ page }) => {
  await apiLoginAsAdmin(page);
  const variant = await prisma.variant.findFirstOrThrow({ where: { productId, colorName: "أسود", name: "S" } });
  const patchRes = await page.request.patch(`/api/admin/variants/${variant.id}`, {
    data: { pricePiastres: 8800 },
  });
  expect(patchRes.ok()).toBeTruthy();

  await page.goto(`/products/${productSlug}`);
  await expect(page.getByRole("heading", { name: productName })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("88").first()).toBeVisible({ timeout: 15_000 });
});

test("toggle the white colour invisible -> its variants are inactive and the PDP hides it", async ({ page }) => {
  await apiLoginAsAdmin(page);
  const colorKey = encodeURIComponent("أبيض|#ffffff");
  const res = await page.request.patch(`/api/admin/products/${productId}/colors/${colorKey}`, {
    data: { active: false },
  });
  expect(res.ok()).toBeTruthy();

  const whiteVariants = await prisma.variant.findMany({ where: { productId, colorName: "أبيض" } });
  expect(whiteVariants.every((v) => v.active === false)).toBeTruthy();

  await page.goto(`/products/${productSlug}`);
  await expect(page.getByRole("heading", { name: productName })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /أبيض/ })).toHaveCount(0);

  const audit = await prisma.adminAuditLog.findFirst({ where: { entityId: productId, action: "color_visibility" }, orderBy: { createdAt: "desc" } });
  expect(audit).toBeTruthy();
});

test("category filter facets exclude a hidden colour's sizes and prices", async ({ page }) => {
  // Backlog 9.8b review fix 4: a third colour with a size and a price nothing else in the
  // fixture category carries, hidden before the facets are first read (the route caches per
  // slug for 300 s, and this category's slug is unique to this run).
  await apiLoginAsAdmin(page);
  const addRes = await page.request.post(`/api/admin/products/${productId}/colors`, {
    data: { colorName: "أخضر", colorHex: "#00aa00", sizes: ["XXL"], pricePiastres: 20000 },
  });
  expect(addRes.ok()).toBeTruthy();
  const hideRes = await page.request.patch(
    `/api/admin/products/${productId}/colors/${encodeURIComponent("أخضر|#00aa00")}`,
    { data: { active: false } }
  );
  expect(hideRes.ok()).toBeTruthy();

  const res = await page.request.get(`/api/categories/catalog-test-cat-${uniqueSuffix}/filters`);
  expect(res.ok()).toBeTruthy();
  const facets = (await res.json()).data as { sizes: string[]; minPrice: number; maxPrice: number };
  expect(facets.sizes).not.toContain("XXL");
  expect(facets.maxPrice).toBeLessThan(200);
  // What is visible: black S/M/L (88, 90, 100) and the two bulk fixtures (133, 99).
  expect(facets.maxPrice).toBe(133);
  expect(facets.minPrice).toBe(88);
});

test("the variant PATCH with stockAvailable/stockReserved in the body is a 200 with no error (backlog 9.9 — the columns no longer exist on Variant)", async ({ page }) => {
  await apiLoginAsAdmin(page);
  const variant = await prisma.variant.findFirstOrThrow({ where: { productId, colorName: "أسود", name: "M" } });
  const res = await page.request.patch(`/api/admin/variants/${variant.id}`, {
    data: { pricePiastres: 9000, stockAvailable: 99999, stockReserved: 55555 },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json.error).toBeUndefined();
  const after = await prisma.variant.findUniqueOrThrow({ where: { id: variant.id } });
  expect(after.pricePiastres).toBe(9000);
});

test("bulk edit +10% selling price on two fixture products, with preview -> variants updated to the piastre, audit rows written", async ({ page }) => {
  await apiLoginAsAdmin(page);
  const body = { productIds: [bulkProductAId, bulkProductBId], price: { field: "selling", mode: "percent", value: 10 } };

  const previewRes = await page.request.post("/api/admin/products/bulk/preview", { data: body });
  expect(previewRes.ok()).toBeTruthy();
  const previewJson = await previewRes.json();
  const previewA = previewJson.data.products.find((p: { id: string }) => p.id === bulkProductAId);
  expect(previewA.variants[0].newPricePiastres).toBe(14630); // 13300 * 1.1 = 14630.0

  const applyRes = await page.request.post("/api/admin/products/bulk/apply", { data: body });
  expect(applyRes.ok()).toBeTruthy();
  const applyJson = await applyRes.json();
  expect(applyJson.data.updated).toBeGreaterThanOrEqual(2);

  const variantA = await prisma.variant.findUniqueOrThrow({ where: { id: bulkVariantAId } });
  expect(variantA.pricePiastres).toBe(14630);
  const variantB = await prisma.variant.findUniqueOrThrow({ where: { id: bulkVariantBId } });
  expect(variantB.pricePiastres).toBe(10890); // 9900 * 1.1 = 10890.0

  const auditRows = await prisma.adminAuditLog.findMany({ where: { entityId: { in: [bulkProductAId, bulkProductBId] }, action: "bulk_edit" } });
  expect(auditRows.length).toBeGreaterThanOrEqual(2);
});

test("export-excel still returns 200 after the catalog rebuild", async ({ page }) => {
  await apiLoginAsAdmin(page);
  const res = await page.request.get("/api/admin/products/export-excel");
  expect(res.status()).toBe(200);
});

test("401 signed out, 403 for a customer", async ({ page, browser }) => {
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  const anonRes = await anonPage.request.post(`/api/admin/products/${productId}/colors`, {
    data: { colorName: "رمادي", sizes: ["S"], pricePiastres: 9000 },
  });
  expect(anonRes.status()).toBe(401);
  await anonContext.close();

  await apiLoginAsCustomer(page);
  const custRes = await page.request.post(`/api/admin/products/${productId}/colors`, {
    data: { colorName: "رمادي", sizes: ["S"], pricePiastres: 9000 },
  });
  expect(custRes.status()).toBe(403);
});

test("390x844: the product page renders without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdminUi(page);
  await page.goto(`/admin/products/${productId}`);
  await expect(page.getByRole("heading", { name: productName })).toBeVisible({ timeout: 20_000 });
  const bodyWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(bodyWidth).toBeLessThanOrEqual(400);
});

test("screenshots at 1440x900, 1514x681, 1024x768, 390x844: product, products list, categories", async ({ page }) => {
  await loginAsAdminUi(page);
  for (const [w, h] of [[1440, 900], [1514, 681], [1024, 768], [390, 844]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`/admin/products/${productId}`);
    await expect(page.getByRole("heading", { name: productName })).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: `screenshots/admin-v2-product-${w}x${h}.png` });

    await page.goto("/admin/products");
    await expect(page.getByRole("heading", { name: "المنتجات", exact: true })).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: `screenshots/admin-v2-products-${w}x${h}.png` });

    await page.goto("/admin/categories");
    await expect(page.getByRole("heading", { name: "الفئات", exact: true })).toBeVisible({ timeout: 20_000 });
    await page.screenshot({ path: `screenshots/admin-v2-categories-${w}x${h}.png` });
  }
});

test("10.16 — products list row shows the fixture product's slug; product page variant row shows its SKU", async ({ page }) => {
  await loginAsAdminUi(page);
  await page.goto(`/admin/products?q=${encodeURIComponent(productName)}`);
  const row = page.locator(`tr[data-row-id="${productId}"]`);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row).toContainText(productSlug);

  await page.goto(`/admin/products/${productId}`);
  await expect(page.getByRole("heading", { name: productName })).toBeVisible({ timeout: 20_000 });
  const firstVariant = await prisma.variant.findFirstOrThrow({ where: { productId }, orderBy: { name: "asc" } });
  await expect(page.getByText(firstVariant.sku, { exact: true }).first()).toBeVisible();
});

test("10.12 — the product page's «← المنتجات» button returns to the same list page and scrolls to the product", async ({ page }) => {
  await apiLoginAsAdmin(page);
  await page.goto("/admin/products");
  const rows = page.locator("tr[data-row-id]");
  await expect(rows.first()).toBeVisible({ timeout: 30_000 });
  // Go to the second page when the catalogue has one; the bug was the button pushing page 1.
  const next = page.getByRole("button", { name: "الصفحة التالية" }).first();
  const paged = (await next.count()) > 0 && (await next.isEnabled());
  if (paged) {
    const firstOnPage1 = await rows.first().getAttribute("data-row-id");
    await next.click();
    await expect(page).toHaveURL(/page=1/, { timeout: 20_000 });
    // Page 1's rows (and the counter) update before page 2's rows arrive — wait for the rows.
    await expect(rows.first()).not.toHaveAttribute("data-row-id", firstOnPage1!, { timeout: 30_000 });
  }
  const idx = Math.min((await rows.count()) - 1, 12);
  const row = rows.nth(idx);
  const rowId = await row.getAttribute("data-row-id");
  await row.scrollIntoViewIfNeeded();
  await row.locator(`a[href="/admin/products/${rowId}"]`).first().click();
  await expect(page).toHaveURL(new RegExp(`/admin/products/${rowId}$`), { timeout: 30_000 });
  await page.getByRole("button", { name: "← المنتجات" }).click();
  await expect(page).toHaveURL(paged ? /\/admin\/products\?page=1$/ : /\/admin\/products$/, { timeout: 30_000 });
  const target = page.locator(`tr[data-row-id="${rowId}"]`);
  await expect(target).toBeInViewport({ timeout: 30_000 });
});
