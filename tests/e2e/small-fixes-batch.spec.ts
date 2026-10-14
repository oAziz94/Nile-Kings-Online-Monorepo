import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { safeWhere, definedIds } from "./db-cleanup";
import { setStorefrontLocationViaApi } from "./storefront-location";

/**
 * Backlog 10.26 (PDP placeholder image must not trip Next's "loader does not implement width"
 * dev warning), 10.27 (fixed location pill must not float over the size chips) and the 10.48 note
 * (same pill over the bottom of the checkout address form / submit row at 360x640).
 * (10.24, the lightbox focus trap, is asserted in order-item-thumbnails.spec.ts.)
 *
 * One fixture product with NO images at all (so the PDP falls back to the placeholder), three
 * sizes, stocked at the active partners of the Cairo rule; one fixture customer for checkout.
 * Everything is created here and removed by id in afterAll.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

const prisma = new PrismaClient();
const GOVERNORATE = "القاهرة";
const PHONE = "+201099955496";
const PASSWORD = "SmallFixesTest123!";

let userId = "";
let categoryId = "";
let productId = "";
let productSlug = "";
const variantIds: string[] = [];
const inventoryIds: string[] = [];

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

test.beforeAll(async () => {
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${(await scryptAsync(PASSWORD, salt)).toString("hex")}`;
  const user = await prisma.user.upsert({
    where: { phone: PHONE },
    create: { phone: PHONE, role: "CUSTOMER", passwordHash },
    update: { passwordHash },
  });
  userId = user.id;
  await prisma.savedAddress.deleteMany({ where: safeWhere({ userId }) });

  const suffix = `${Date.now()}`;
  const category = await prisma.category.create({
    data: { name: `فئة اختبار 10.27 ${suffix}`, slug: `small-fixes-cat-${suffix}`, sortOrder: 0 },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: {
      categoryId,
      name: `منتج اختبار 10.27 ${suffix}`,
      slug: `small-fixes-${suffix}`,
      active: true,
      weightGrams: 300,
      variants: {
        create: ["S", "M", "L"].map((size) => ({
          sku: `SMALLFIX-${size}-${suffix}`,
          slug: `small-fixes-${suffix}_${size.toLowerCase()}`,
          name: size,
          pricePiastres: 10000,
        })),
      },
    },
    include: { variants: true },
  });
  productId = product.id;
  productSlug = product.slug;
  variantIds.push(...product.variants.map((v) => v.id));
  const rule = await prisma.reroutingRule.findUnique({
    where: { governorate: GOVERNORATE },
    include: { partners: { where: { isActive: true } } },
  });
  if (!rule || rule.partners.length === 0) throw new Error("No active rule partners for the Cairo rule in the redesign DB.");
  for (const rp of rule.partners) {
    for (const variantId of variantIds) {
      const row = await prisma.partnerInventory.create({
        data: { partnerId: rp.partnerId, variantId, stockAvailable: 10, stockReserved: 0 },
      });
      inventoryIds.push(row.id);
    }
  }
});

test.afterAll(async () => {
  const ids = definedIds(variantIds);
  if (ids.length > 0) await prisma.cartItem.deleteMany({ where: { variantId: { in: ids } } });
  if (inventoryIds.length > 0) await prisma.partnerInventory.deleteMany({ where: { id: { in: inventoryIds } } });
  if (productId) {
    await prisma.variant.deleteMany({ where: safeWhere({ productId }) });
    await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
  }
  if (categoryId) await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  if (userId) {
    await prisma.savedAddress.deleteMany({ where: safeWhere({ userId }) });
    await prisma.cart.deleteMany({ where: safeWhere({ userId }) });
    await prisma.user.deleteMany({ where: safeWhere({ id: userId }) });
  }
  await prisma.$disconnect();
});

/**
 * Scrolls the page top to bottom in small steps. At every step the location pill must either be
 * hidden or not intersect any `[data-avoid-location-pill]` element. Returns how many steps hid
 * the pill, so the caller can prove the overlap really happened (and the fix engaged).
 */
async function sweepPillOverlap(page: Page): Promise<number> {
  await expect(page.getByTestId("location-pill")).toBeAttached();
  const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  let hiddenSteps = 0;
  for (let y = 0; y <= total + 30; y += 30) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(80);
    const result = await page.evaluate(() => {
      const pillEl = document.querySelector('[data-testid="location-pill"]') as HTMLElement | null;
      if (!pillEl) return { hidden: true, overlap: false };
      const hidden = getComputedStyle(pillEl).visibility === "hidden";
      const pr = pillEl.getBoundingClientRect();
      const overlap = Array.from(document.querySelectorAll("[data-avoid-location-pill]")).some((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.left < pr.right && r.right > pr.left && r.top < pr.bottom && r.bottom > pr.top;
      });
      return { hidden, overlap };
    });
    if (result.hidden) hiddenSteps++;
    expect(result.hidden || !result.overlap, `pill overlaps a protected element at scrollY=${y}`).toBe(true);
  }
  return hiddenSteps;
}

test("10.26 - a PDP with no images renders the placeholder without the 'does not implement width' warning", async ({ page }) => {
  const messages: string[] = [];
  page.on("console", (m) => messages.push(m.text()));
  await setStorefrontLocationViaApi(page, GOVERNORATE);
  await page.goto(`/products/${productSlug}`);
  await expect(page.getByRole("radiogroup", { name: "المقاس" })).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  expect(messages.filter((t) => t.includes("does not implement width"))).toEqual([]);
});

test("10.27 - mobile PDP (390x844): the location pill never floats over the size chips", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setStorefrontLocationViaApi(page, GOVERNORATE);
  await page.goto(`/products/${productSlug}`);
  await expect(page.getByRole("radiogroup", { name: "المقاس" })).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  const hiddenSteps = await sweepPillOverlap(page);
  // The chips pass behind the pill's corner at some scroll position on this layout; the pill
  // must have stepped aside there, and be back once scrolled past.
  expect(hiddenSteps).toBeGreaterThan(0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(150);
  await expect(page.getByTestId("location-pill")).toBeVisible();
});

test("10.48 note - checkout (360x640): the pill never covers the address form or the submit button", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const login = await page.request.post("/api/auth/login", { data: { phone: PHONE, password: PASSWORD } });
  expect(login.ok()).toBeTruthy();
  await setStorefrontLocationViaApi(page, GOVERNORATE);
  const add = await page.request.post("/api/cart/items", { data: { variantId: variantIds[0], quantity: 1 } });
  expect(add.ok()).toBeTruthy();
  await page.goto("/checkout");
  const governorateField = page.getByLabel("المحافظة *");
  const addNew = page.getByRole("button", { name: /إضافة عنوان (جديد|التوصيل)/ });
  await expect(governorateField.or(addNew)).toBeVisible({ timeout: 15_000 });
  if (await addNew.isVisible().catch(() => false)) await addNew.click();
  await expect(governorateField).toBeVisible();
  const submit = page.getByRole("button", { name: "تأكيد الطلب" });
  await expect(submit).toBeVisible();
  await sweepPillOverlap(page);

  // Scrolled to the submit row: the pill is hidden or does not intersect the button.
  await submit.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const pill = page.getByTestId("location-pill");
  const hidden = await pill.evaluate((el) => getComputedStyle(el).visibility === "hidden");
  const pillBox = await pill.boundingBox();
  const submitBox = await submit.boundingBox();
  if (!hidden && pillBox && submitBox) {
    const intersects =
      pillBox.x < submitBox.x + submitBox.width &&
      pillBox.x + pillBox.width > submitBox.x &&
      pillBox.y < submitBox.y + submitBox.height &&
      pillBox.y + pillBox.height > submitBox.y;
    expect(intersects).toBe(false);
  }
});
