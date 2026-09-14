import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { uploadToCloudinary, cloudinaryCredentialsAvailable } from "@/lib/media/cloudinary-upload";
import { destroyCloudinaryAsset } from "@/lib/media/cloudinary-admin";

/**
 * Backlog 9.8a coverage: MediaAsset registration at upload, usage matching, assign/hero/
 * replace/delete, the Cloudinary reconcile, alt text, 401/403 and the mobile grid.
 *
 * Cloudinary credentials are shared across `.env`/`.env.redesign` (not a database secret, so
 * `test-env.ts`'s production-DB guard doesn't apply to them) — `cloudinaryCredentialsAvailable()`
 * decides at runtime whether the upload/sync/delete tests run for real or skip with a named
 * reason; the assign/hero/alt/401-403 tests always run, on Prisma-inserted rows with fake urls
 * when Cloudinary is unavailable.
 *
 * Every asset this file creates lives under `nile-kings/products/e2e-<suffix>` (the upload
 * route's test-only folder override) and is destroyed via the Cloudinary API + its DB row
 * deleted in `afterAll` — this file never touches an asset it did not itself create.
 */

const prisma = new PrismaClient();
const HAS_CLOUDINARY = cloudinaryCredentialsAvailable();

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

const ADMIN_PHONE = "+201099955301";
const ADMIN_PASSWORD = "AdminMediaTest123!";
const CUSTOMER_PHONE = "+201099955302";
const CUSTOMER_PASSWORD = "AdminMediaCust123!";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const TEST_FOLDER = `nile-kings/products/e2e-${uniqueSuffix}`;
const FIXTURE_PNG = path.join(__dirname, "fixtures", "tiny.png");

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

let adminUserId: string;
let customerUserId: string;
let categoryId: string;
let productId: string;
let productName: string;
let productSlug: string;
const COLOR_NAME = "أسود";
const COLOR_HEX = "#000000";
const COLOR_KEY = `${COLOR_NAME}|${COLOR_HEX}`;

// Every MediaAsset id / Cloudinary publicId this file registers, for afterAll cleanup.
const createdAssetIds: string[] = [];
const createdPublicIds: string[] = [];

/** Logs the page's request context in as admin without a UI round trip — for tests that only
 * ever call `page.request` (no navigation needed). Shares cookie storage with `page`. */
async function apiLoginAsAdmin(page: Page) {
  const res = await page.request.post("/api/auth/login", { data: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD } });
  expect(res.ok()).toBeTruthy();
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 25_000 });
}

/** Registers a MediaAsset row directly (via Prisma) with a fake url — used when Cloudinary
 * credentials are unavailable, so the assign/hero/alt tests still exercise real DB rows. */
async function createFakeAsset(suffix: string) {
  const asset = await prisma.mediaAsset.create({
    data: {
      publicId: `${TEST_FOLDER}/${suffix}`,
      url: `https://res.cloudinary.com/demo/image/upload/${TEST_FOLDER}/${suffix}.png`,
      width: 100,
      height: 100,
      bytes: 1234,
      format: "png",
      folder: TEST_FOLDER,
      uploadedByUserId: adminUserId,
    },
  });
  createdAssetIds.push(asset.id);
  createdPublicIds.push(asset.publicId);
  return asset;
}

/** Uploads the fixture PNG through our own registered upload route (test folder override),
 * so a real MediaAsset row and a real Cloudinary resource both exist. */
async function uploadRealAsset(page: Page, suffix: string) {
  const buf = fs.readFileSync(FIXTURE_PNG);
  const res = await page.request.post("/api/admin/upload", {
    multipart: {
      file: { name: `${suffix}.png`, mimeType: "image/png", buffer: buf },
      folder: `${TEST_FOLDER}-${suffix}`,
    },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  createdAssetIds.push(json.data.assetId);
  createdPublicIds.push(json.data.publicId);
  return json.data as { url: string; assetId: string; publicId: string };
}

test.beforeAll(async () => {
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: "مسؤول اختبار الصور" },
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
    data: { name: `فئة اختبار الصور ${uniqueSuffix}`, slug: `media-test-cat-${uniqueSuffix}`, sortOrder: 0 },
  });
  categoryId = category.id;

  productName = `منتج اختبار الصور ${uniqueSuffix}`;
  productSlug = `media-test-product-${uniqueSuffix}`;
  const product = await prisma.product.create({
    data: {
      categoryId,
      name: productName,
      slug: productSlug,
      active: true,
      variants: {
        create: [
          { sku: `MEDIA-${uniqueSuffix}-S`, slug: `${productSlug}_s_${COLOR_HEX.replace("#", "")}`, name: "S", colorName: COLOR_NAME, colorHex: COLOR_HEX, pricePiastres: 10000, stockAvailable: 5 },
          { sku: `MEDIA-${uniqueSuffix}-M`, slug: `${productSlug}_m_${COLOR_HEX.replace("#", "")}`, name: "M", colorName: COLOR_NAME, colorHex: COLOR_HEX, pricePiastres: 10000, stockAvailable: 5 },
        ],
      },
    },
  });
  productId = product.id;
});

test.afterAll(async () => {
  for (const publicId of createdPublicIds) {
    if (HAS_CLOUDINARY) {
      await destroyCloudinaryAsset(publicId).catch(() => undefined);
    }
  }
  await prisma.adminAuditLog.deleteMany({ where: { OR: [{ entityId: productId }, { entityId: { in: createdAssetIds } }] } });
  await prisma.variantImage.deleteMany({ where: { productId } });
  await prisma.mediaAsset.deleteMany({ where: { id: { in: createdAssetIds } } });
  await prisma.variant.deleteMany({ where: { productId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, customerUserId] } } });
  await prisma.$disconnect();
});

test("upload registers a MediaAsset row with public id and dimensions; the tile shows 'غير مسندة'", async ({ page }) => {
  test.skip(!HAS_CLOUDINARY, "no CLOUDINARY_API_SECRET in the test env — upload/sync/delete skipped");
  await loginAsAdmin(page);
  await page.goto("/admin/media");
  await expect(page.getByRole("heading", { name: "الصور" })).toBeVisible({ timeout: 20_000 });

  const fileInput = page.locator('input[type="file"]').first();
  const responsePromise = page.waitForResponse((r) => r.url().includes("/api/admin/upload") && r.request().method() === "POST");
  await fileInput.setInputFiles(FIXTURE_PNG);
  const response = await responsePromise;
  const json = await response.json();
  expect(json.success).toBeTruthy();
  expect(json.data.assetId).toBeTruthy();
  expect(json.data.publicId).toBeTruthy();
  createdAssetIds.push(json.data.assetId);
  createdPublicIds.push(json.data.publicId);

  const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: json.data.assetId } });
  expect(asset.publicId).toBe(json.data.publicId);
  expect(asset.width).toBeGreaterThan(0);
  expect(asset.height).toBeGreaterThan(0);

  await page.reload();
  await expect(page.getByText("غير مسندة").first()).toBeVisible({ timeout: 15_000 });
});

test("assign to a product colour creates a VariantImage row with assetId, and the PDP gallery shows it", async ({ page }) => {
  await apiLoginAsAdmin(page);
  const asset = HAS_CLOUDINARY ? await uploadRealAsset(page, "assign") : await createFakeAsset("assign");
  // `uploadRealAsset` returns `assetId`, `createFakeAsset` returns the Prisma row (`id`).
  const assetId = HAS_CLOUDINARY ? (asset as { assetId: string }).assetId : (asset as { id: string }).id;
  const assignRes = await page.request.post("/api/admin/media/assign", {
    data: { assetIds: [assetId], productId, colorKey: COLOR_KEY },
  });
  expect(assignRes.ok()).toBeTruthy();

  const variantImage = await prisma.variantImage.findFirstOrThrow({ where: { productId, colorKey: COLOR_KEY, assetId } });
  expect(variantImage.assetId).toBe(assetId);

  if (HAS_CLOUDINARY) {
    await page.goto(`/products/${productSlug}`);
    await expect(page.getByRole("heading", { name: productName })).toBeVisible({ timeout: 20_000 });
    const listItems = page.locator('[role="listitem"][aria-label^="صورة"]');
    await expect(listItems).toHaveCount(1, { timeout: 15_000 });
  }
});

test("hero sets Product.imageUrl and heroAssetId, and the storefront card shows it", async ({ page }) => {
  await apiLoginAsAdmin(page);
  const asset = HAS_CLOUDINARY ? await uploadRealAsset(page, "hero") : await createFakeAsset("hero");
  const assetId = HAS_CLOUDINARY ? (asset as { assetId: string }).assetId : (asset as { id: string }).id;
  const assetUrl = asset.url;

  const res = await page.request.post("/api/admin/media/hero", { data: { assetId, productId } });
  expect(res.ok()).toBeTruthy();

  const product = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  expect(product.heroAssetId).toBe(assetId);
  expect(product.imageUrl).toBe(assetUrl);

  if (HAS_CLOUDINARY) {
    await page.goto(`/search?q=${encodeURIComponent(productName)}`);
    const img = page.getByRole("img", { name: productName }).first();
    await expect(img).toBeVisible({ timeout: 20_000 });
    const src = await img.getAttribute("src");
    expect(decodeURIComponent(src ?? "")).toContain(assetUrl.split("/upload/")[1]);
  }
});

test("delete is refused (409) while an asset is in use, and allowed once unused", async ({ page }) => {
  await apiLoginAsAdmin(page);
  const asset = HAS_CLOUDINARY ? await uploadRealAsset(page, "delete") : await createFakeAsset("delete");
  const assetId = HAS_CLOUDINARY ? (asset as { assetId: string }).assetId : (asset as { id: string }).id;

  const assignRes = await page.request.post("/api/admin/media/assign", {
    data: { assetIds: [assetId], productId, colorKey: COLOR_KEY },
  });
  expect(assignRes.ok()).toBeTruthy();

  const deleteRes = await page.request.delete(`/api/admin/media/${assetId}`);
  expect(deleteRes.status()).toBe(409);
  const deleteJson = await deleteRes.json();
  expect(deleteJson.error.message).toContain(productName);

  // Simulate the admin removing the asset from the gallery (9.8a has no dedicated "unassign"
  // route — that's a 9.8b product-page action) so the delete path can be proven end to end.
  await prisma.variantImage.deleteMany({ where: { productId, assetId } });

  const deleteRes2 = await page.request.delete(`/api/admin/media/${assetId}`);
  expect(deleteRes2.ok()).toBeTruthy();
  const gone = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  expect(gone).toBeNull();
  createdAssetIds.splice(createdAssetIds.indexOf(assetId), 1);
  const piIdx = createdPublicIds.indexOf(asset.publicId);
  if (piIdx >= 0) createdPublicIds.splice(piIdx, 1);
});

test("replace keeps the VariantImage pointing at the new asset, and the old asset becomes unused", async ({ page }) => {
  test.skip(!HAS_CLOUDINARY, "replace re-uploads to Cloudinary — needs credentials");
  await apiLoginAsAdmin(page);
  const oldAsset = await uploadRealAsset(page, "replace-old");
  await page.request.post("/api/admin/media/assign", {
    data: { assetIds: [oldAsset.assetId], productId, colorKey: COLOR_KEY },
  });

  const buf = fs.readFileSync(FIXTURE_PNG);
  const replaceRes = await page.request.post(`/api/admin/media/${oldAsset.assetId}/replace`, {
    multipart: { file: { name: "replace-new.png", mimeType: "image/png", buffer: buf } },
  });
  expect(replaceRes.ok()).toBeTruthy();
  const replaceJson = await replaceRes.json();
  createdAssetIds.push(replaceJson.data.newAssetId);
  const newAssetRow = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: replaceJson.data.newAssetId } });
  createdPublicIds.push(newAssetRow.publicId);

  const vi = await prisma.variantImage.findFirstOrThrow({ where: { productId, colorKey: COLOR_KEY, assetId: replaceJson.data.newAssetId } });
  expect(vi.url).toBe(replaceJson.data.url);

  const oldUsageRes = await page.request.get(`/api/admin/media?q=${encodeURIComponent(oldAsset.publicId)}`);
  const oldUsageJson = await oldUsageRes.json();
  const oldItem = oldUsageJson.data.items.find((i: { publicId: string }) => i.publicId === oldAsset.publicId);
  expect(oldItem.usage).toEqual([]);
});

test("alt text saves", async ({ page }) => {
  await apiLoginAsAdmin(page);
  const asset = HAS_CLOUDINARY ? await uploadRealAsset(page, "alt") : await createFakeAsset("alt");
  const assetId = HAS_CLOUDINARY ? (asset as { assetId: string }).assetId : (asset as { id: string }).id;

  const res = await page.request.patch(`/api/admin/media/${assetId}`, { data: { alt: "تي شيرت أسود قطن" } });
  expect(res.ok()).toBeTruthy();
  const updated = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
  expect(updated.alt).toBe("تي شيرت أسود قطن");
});

test("sync imports an unregistered Cloudinary resource as unused and flags a destroyed one as missing", async ({ page }) => {
  test.skip(!HAS_CLOUDINARY, "no CLOUDINARY_API_SECRET in the test env — sync skipped");
  // The real Cloudinary account's `nile-kings/products` + `nile-kings/routed-proofs` folders
  // can be large — the sync route itself targets <60s for the current folder size and pages in
  // 500s if it grows, but this test's own HTTP call (+cold Turbopack compile of the route on
  // first hit) needs more headroom than the suite's default 60s.
  test.setTimeout(180_000);
  await loginAsAdmin(page);

  const buf = fs.readFileSync(FIXTURE_PNG).toString("base64");

  // Uploaded directly to Cloudinary, bypassing our route — stays unregistered until sync.
  const unregistered = await uploadToCloudinary({ base64: buf, contentType: "image/png", folder: `${TEST_FOLDER}-sync-import` });
  createdPublicIds.push(unregistered.public_id);

  // Registered through our route, then destroyed directly in Cloudinary — sync should flag it.
  const toDestroy = await uploadRealAsset(page, "sync-missing");
  await destroyCloudinaryAsset(toDestroy.publicId);
  const piIdx = createdPublicIds.indexOf(toDestroy.publicId);
  if (piIdx >= 0) createdPublicIds.splice(piIdx, 1); // already gone from Cloudinary, nothing to destroy in afterAll

  const syncRes = await page.request.post("/api/admin/media/sync");
  expect(syncRes.ok()).toBeTruthy();
  const syncJson = await syncRes.json();
  expect(syncJson.data.imported).toBeGreaterThanOrEqual(1);
  expect(syncJson.data.missing).toBeGreaterThanOrEqual(1);
  expect(typeof syncJson.data.durationMs).toBe("number");

  const imported = await prisma.mediaAsset.findUnique({ where: { publicId: unregistered.public_id } });
  expect(imported).not.toBeNull();
  expect(imported!.deletedAt).toBeNull();
  createdAssetIds.push(imported!.id);

  const missing = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: toDestroy.assetId } });
  expect(missing.deletedAt).not.toBeNull();

  // Report line for the final task report — the real folder's size/duration, read-only.
  console.log(`[9.8a sync] total=${syncJson.data.total} durationMs=${syncJson.data.durationMs}`);
});

test("401/403: a signed-out request and a customer session are both rejected", async ({ page, browser }) => {
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  const guestRes = await guestPage.request.get("/api/admin/media");
  expect(guestRes.status()).toBe(401);
  await guestContext.close();

  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(CUSTOMER_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(CUSTOMER_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  const custRes = await page.request.get("/api/admin/media");
  expect(custRes.status()).toBe(403);
});

test("390×844: the grid is two columns with no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  await page.goto("/admin/media");
  await expect(page.getByRole("heading", { name: "الصور" })).toBeVisible({ timeout: 20_000 });

  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  const tiles = page.locator(".grid.grid-cols-2 > div");
  const count = await tiles.count();
  if (count >= 2) {
    const first = await tiles.nth(0).boundingBox();
    const second = await tiles.nth(1).boundingBox();
    expect(first && second && Math.abs(first.y - second.y)).toBeLessThan(4);
  }
});

const SCREENSHOT_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1514, height: 681 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

test("screenshots: /admin/media at the four viewports", async ({ page }) => {
  await loginAsAdmin(page);
  for (const { width, height } of SCREENSHOT_VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto("/admin/media");
    await expect(page.getByRole("heading", { name: "الصور" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("جاري التحميل…")).toBeHidden({ timeout: 20_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: `screenshots/admin-v2-media-${width}x${height}.png`, fullPage: true });
  }
});
