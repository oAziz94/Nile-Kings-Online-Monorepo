import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 6.3 — `revalidateTag` on the catalog caches. Proves that an admin write is visible on
 * the very next request, with no wait for the 60s/300s time-based `revalidate` window: a fixture
 * category + product + variant, warm the PDP and the products-listing API once, `PATCH` the
 * product's name through the admin API, then immediately re-request both and assert the new name
 * shows up. Also proves a `DELETE` makes the PDP 404 on the next request.
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

const ADMIN_PHONE = "+201099955496";
const ADMIN_PASSWORD = "CacheTagsTest123!";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function apiLoginAsAdmin(page: Page) {
  const res = await page.request.post("/api/auth/login", { data: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD } });
  expect(res.ok()).toBeTruthy();
}

let adminUserId: string;
let categoryId: string;
let productId: string;
/** Kept even after the delete test removes the row, so `afterAll` can still clean up its
 *  `AdminAuditLog` rows (create/update/delete all logged against this id). */
let productIdForCleanup: string;
let productSlug: string;
const ORIGINAL_NAME = `منتج اختبار الكاش ${uniqueSuffix}`;
const RENAMED_NAME = `منتج اختبار الكاش (معدّل) ${uniqueSuffix}`;

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

test.beforeAll(async () => {
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: "مسؤول اختبار الكاش" },
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
  });
  adminUserId = admin.id;

  const category = await prisma.category.create({
    data: { name: `فئة اختبار الكاش ${uniqueSuffix}`, slug: `cache-tags-test-cat-${uniqueSuffix}`, sortOrder: 0 },
  });
  categoryId = category.id;

  productSlug = `cache-tags-test-product-${uniqueSuffix}`;
  const product = await prisma.product.create({
    data: {
      categoryId,
      name: ORIGINAL_NAME,
      slug: productSlug,
      active: true,
      variants: {
        create: [
          { sku: `CACHETAGS-${uniqueSuffix}-M`, slug: `${productSlug}_m`, name: "M", pricePiastres: 10000 },
        ],
      },
    },
  });
  productId = product.id;
  productIdForCleanup = product.id;
});

test.afterAll(async () => {
  await prisma.adminAuditLog.deleteMany({ where: safeWhere({ entityId: productIdForCleanup }) });
  await prisma.variant.deleteMany({ where: safeWhere({ productId: productIdForCleanup }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: productIdForCleanup }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await prisma.user.deleteMany({ where: safeWhere({ id: adminUserId }) });
});

test("admin product rename is visible on the PDP and in the listing API on the very next request", async ({ page }) => {
  await apiLoginAsAdmin(page);

  // Warm both caches with the original name.
  const pdpRes1 = await page.goto(`/products/${productSlug}`);
  expect(pdpRes1?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: ORIGINAL_NAME })).toBeVisible();

  const listRes1 = await page.request.get(`/api/products?q=${encodeURIComponent(uniqueSuffix)}`);
  const listJson1 = (await listRes1.json()) as { data: { products: { name: string }[] } };
  expect(listJson1.data.products.some((p) => p.name === ORIGINAL_NAME)).toBe(true);

  // Rename through the admin API.
  const patchRes = await page.request.patch(`/api/admin/products/${productId}`, {
    data: { name: RENAMED_NAME },
  });
  expect(patchRes.ok()).toBeTruthy();

  // The very next request — no wait — must already show the new name.
  const pdpRes2 = await page.goto(`/products/${productSlug}`);
  expect(pdpRes2?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: RENAMED_NAME })).toBeVisible();

  const listRes2 = await page.request.get(`/api/products?q=${encodeURIComponent(uniqueSuffix)}`);
  const listJson2 = (await listRes2.json()) as { data: { products: { name: string }[] } };
  expect(listJson2.data.products.some((p) => p.name === RENAMED_NAME)).toBe(true);
  expect(listJson2.data.products.some((p) => p.name === ORIGINAL_NAME)).toBe(false);

  // Rename back so a subsequent run (or another spec reading this suffix pattern) sees the
  // fixture's declared name if it inspects the row before `afterAll` runs.
  const revertRes = await page.request.patch(`/api/admin/products/${productId}`, {
    data: { name: ORIGINAL_NAME },
  });
  expect(revertRes.ok()).toBeTruthy();
});

test("admin product delete makes the PDP 404 on the very next request", async ({ page }) => {
  await apiLoginAsAdmin(page);

  // Warm the cache first.
  const pdpRes1 = await page.goto(`/products/${productSlug}`);
  expect(pdpRes1?.status()).toBe(200);

  const deleteRes = await page.request.delete(`/api/admin/products/${productId}`);
  expect(deleteRes.ok()).toBeTruthy();

  const pdpRes2 = await page.goto(`/products/${productSlug}`);
  expect(pdpRes2?.status()).toBe(404);
});
