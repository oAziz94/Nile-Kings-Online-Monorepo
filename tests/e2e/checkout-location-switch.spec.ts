import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { safeWhere } from "./db-cleanup";
import { setStorefrontLocationViaApi } from "./storefront-location";

// Backlog 10.49 — checkout address in a different governorate than the storefront location.
//
// Fixture design (nothing real is modified, every row is created here and deleted by id):
//  - the storefront location is القاهرة (real rule, real partners — only extra PartnerInventory
//    rows for OUR fixture variants are added, for every active partner of that rule so the
//    cart can hold them whichever partner the cookie resolves to);
//  - the delivery address is الوادي الجديد, the one governorate with no ReroutingRule, for which
//    this spec creates a rule + fixture partner (same sanctioned exception as public-pdp.spec.ts;
//    do NOT run concurrently with specs that also create that rule: public-pdp, admin-v2-routing);
//  - variant X is stocked at both places, variant Y only at القاهرة -> switching prunes Y.
// Unrun at authoring time (written in a worktree without the app env); the PM runs it in the main tree.

const prisma = new PrismaClient();
const STOREFRONT_GOV = "القاهرة";
const ADDRESS_GOV = "الوادي الجديد";
const FIXTURE_PHONE = "+201099912346";
const FIXTURE_PASSWORD = "CheckoutSwitch123!";
// Fixture admin, used only to clear the storefront's 5-minute "governorate → partner" cache
// (`getCachedPartnerIdForGovernorate`, tag REROUTING_RULES_TAG) after this spec creates and
// before it deletes its الوادي الجديد rule — only the admin routing API revalidates that tag, so a
// rule created straight through Prisma can be shadowed by a stale partner from an earlier run.
const ADMIN_PHONE = "+201099912347";
const ADMIN_PASSWORD = "CheckoutSwitchAdmin123!";
const ADDRESS = {
  city: "الخارجة",
  area: "الخارجة",
  street: "شارع الاختبار 1",
  phone: "01099912346",
};

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

let userId = "";
let adminUserId = "";
let categoryId = "";

/** Logged-in admin API context, for the two cache-revalidating routing calls. */
async function adminApi() {
  const baseURL = test.info().project.use.baseURL as string;
  const ctx = await playwrightRequest.newContext({ baseURL });
  const login = await ctx.post("/api/auth/login", { data: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD } });
  expect(login.ok(), "fixture admin login").toBeTruthy();
  return ctx;
}
let productXId = "";
let productYId = "";
let variantXId = "";
let variantYId = "";
let productYName = "";
let fixturePartnerId = "";
let ruleId = "";
let rulePartnerId = "";
const inventoryIds: string[] = [];

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const suffix = `${Date.now()}`;
  const salt = crypto.randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${(await scryptAsync(FIXTURE_PASSWORD, salt)).toString("hex")}`;
  const user = await prisma.user.upsert({
    where: { phone: FIXTURE_PHONE },
    create: { phone: FIXTURE_PHONE, role: "CUSTOMER", passwordHash },
    update: { passwordHash },
  });
  userId = user.id;
  await prisma.savedAddress.deleteMany({ where: safeWhere({ userId }) });
  const adminSalt = crypto.randomBytes(16).toString("hex");
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: {
      phone: ADMIN_PHONE,
      role: "ADMIN",
      name: "مسؤول اختبار 10.49",
      passwordHash: `${adminSalt}:${(await scryptAsync(ADMIN_PASSWORD, adminSalt)).toString("hex")}`,
    },
    update: {},
  });
  adminUserId = admin.id;

  const category = await prisma.category.create({
    data: { name: `فئة 10.49 ${suffix}`, slug: `loc-switch-cat-${suffix}`, sortOrder: 0 },
  });
  categoryId = category.id;
  // Two products so the removed-items notice (which lists product names) names Y distinctly.
  productYName = `منتج ص 10.49 ${suffix}`;
  const productX = await prisma.product.create({
    data: {
      categoryId,
      name: `منتج س 10.49 ${suffix}`,
      slug: `loc-switch-x-${suffix}`,
      active: true,
      weightGrams: 300,
      variants: {
        create: [{ sku: `LS-X-${suffix}`, slug: `loc-switch-x-${suffix}_m`, name: "M", pricePiastres: 10000 }],
      },
    },
    include: { variants: true },
  });
  const productY = await prisma.product.create({
    data: {
      categoryId,
      name: productYName,
      slug: `loc-switch-y-${suffix}`,
      active: true,
      weightGrams: 300,
      variants: {
        create: [{ sku: `LS-Y-${suffix}`, slug: `loc-switch-y-${suffix}_m`, name: "M", pricePiastres: 10000 }],
      },
    },
    include: { variants: true },
  });
  productXId = productX.id;
  productYId = productY.id;
  variantXId = productX.variants[0].id;
  variantYId = productY.variants[0].id;

  // Storefront side: every active partner of القاهرة's rule stocks both variants.
  const cairoRule = await prisma.reroutingRule.findUnique({
    where: { governorate: STOREFRONT_GOV },
    include: { partners: { where: { isActive: true } } },
  });
  if (!cairoRule || cairoRule.partners.length === 0) {
    throw new Error("No active rule partners for القاهرة in the redesign DB.");
  }
  for (const rp of cairoRule.partners) {
    for (const variantId of [variantXId, variantYId]) {
      const row = await prisma.partnerInventory.create({
        data: { partnerId: rp.partnerId, variantId, stockAvailable: 10, stockReserved: 0 },
      });
      inventoryIds.push(row.id);
    }
  }

  // Address side: fixture partner + rule for الوادي الجديد, stocking only X.
  const partner = await prisma.partner.create({
    data: {
      partnerType: "AGENT",
      name: `شريك اختبار 10.49 ${suffix}`,
      governorate: ADDRESS_GOV,
      phone: `+2010${suffix}`.slice(0, 13),
      isActive: true,
    },
  });
  fixturePartnerId = partner.id;
  const rule = await prisma.reroutingRule.create({ data: { governorate: ADDRESS_GOV, isActive: true } });
  ruleId = rule.id;
  const rulePartner = await prisma.reroutingRulePartner.create({
    data: { ruleId, partnerId: fixturePartnerId, isActive: true, priority: 0 },
  });
  rulePartnerId = rulePartner.id;
  const xRow = await prisma.partnerInventory.create({
    data: { partnerId: fixturePartnerId, variantId: variantXId, stockAvailable: 10, stockReserved: 0 },
  });
  inventoryIds.push(xRow.id);

  // Clear the cached partner lookup for الوادي الجديد (see ADMIN_PHONE): a no-op isActive PATCH
  // through the admin API calls revalidateReroutingRules().
  const api = await adminApi();
  const bust = await api.patch(`/api/admin/rerouting-rules/${ruleId}`, { data: { isActive: true } });
  expect(bust.ok(), "revalidate rerouting cache after creating the fixture rule").toBeTruthy();
  await api.dispose();
});

test.afterAll(async () => {
  if (userId) {
    // Orders this spec placed (cascades OrderItem/RoutedOrder), then cart lines and addresses.
    await prisma.order.deleteMany({ where: safeWhere({ userId }) });
    await prisma.cartItem.deleteMany({ where: safeWhere({ cart: { userId } }) });
    await prisma.savedAddress.deleteMany({ where: safeWhere({ userId }) });
  }
  if (inventoryIds.length > 0) await prisma.partnerInventory.deleteMany({ where: { id: { in: inventoryIds } } });
  if (rulePartnerId) await prisma.reroutingRulePartner.deleteMany({ where: safeWhere({ id: rulePartnerId }) });
  if (ruleId) {
    // Delete through the admin API so the partner-lookup cache is cleared for the next spec that
    // creates its own الوادي الجديد rule; fall back to Prisma if the API is unreachable.
    try {
      const api = await adminApi();
      await api.delete(`/api/admin/rerouting-rules/${ruleId}`);
      await api.dispose();
    } catch {
      /* fall through to the direct delete */
    }
    await prisma.reroutingRule.deleteMany({ where: safeWhere({ id: ruleId }) });
  }
  if (adminUserId) await prisma.user.deleteMany({ where: safeWhere({ id: adminUserId, phone: ADMIN_PHONE }) });
  if (fixturePartnerId) await prisma.partner.deleteMany({ where: safeWhere({ id: fixturePartnerId }) });
  for (const id of [productXId, productYId]) {
    if (!id) continue;
    await prisma.variant.deleteMany({ where: safeWhere({ productId: id }) });
    await prisma.product.deleteMany({ where: safeWhere({ id }) });
  }
  if (categoryId) await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await prisma.$disconnect();
});

async function prepare(page: Page, variantIds: string[]) {
  const login = await page.request.post("/api/auth/login", {
    data: { phone: FIXTURE_PHONE, password: FIXTURE_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  await setStorefrontLocationViaApi(page, STOREFRONT_GOV, "مدينة نصر");
  const existing = await page.request.get("/api/cart");
  for (const item of ((await existing.json()).data?.items ?? []) as { id: string }[]) {
    await page.request.delete(`/api/cart/items/${item.id}`);
  }
  for (const variantId of variantIds) {
    const add = await page.request.post("/api/cart/items", { data: { variantId, quantity: 1 } });
    expect(add.ok()).toBeTruthy();
  }
}

async function fillAddress(page: Page) {
  const governorateField = page.getByLabel("المحافظة *");
  const addNew = page.getByRole("button", { name: /إضافة عنوان (جديد|التوصيل)/ });
  await expect(governorateField.or(addNew)).toBeVisible({ timeout: 10_000 });
  if (await addNew.isVisible().catch(() => false)) await addNew.click();
  await page.getByLabel("المحافظة *").selectOption(ADDRESS_GOV);
  await page.getByLabel("المدينة *").fill(ADDRESS.city);
  await page.getByLabel("هاتف التوصيل *").fill(ADDRESS.phone);
  // 10.48: المنطقة is a dropdown; الخارجة is on the الوادي الجديد list.
  await page.getByLabel("المنطقة *").selectOption({ label: ADDRESS.area });
  await page.getByLabel("العنوان بالتفصيل *").fill(ADDRESS.street);
}

test("server guard: place-order with an address outside the cookie governorate is 400 LOCATION_MISMATCH", async ({ page }) => {
  await prepare(page, [variantXId]);
  const res = await page.request.post("/api/checkout/place-order", {
    data: {
      address: { governorate: ADDRESS_GOV, ...ADDRESS },
      paymentMethod: "COD",
    },
  });
  expect(res.status()).toBe(400);
  expect(JSON.stringify(await res.json())).toContain("LOCATION_MISMATCH");
  expect(await prisma.order.count({ where: { userId } })).toBe(0);
});

test("cookie القاهرة + address الوادي الجديد: warning, then the order is assigned to the new governorate's partner", async ({ page }) => {
  test.setTimeout(90_000);
  await prepare(page, [variantXId]);
  await page.goto("/checkout");
  await fillAddress(page);

  const warning = page.getByTestId("location-switch-warning");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(
    `عنوان التوصيل في ${ADDRESS_GOV} بينما المتجر يعرض مخزون ${STOREFRONT_GOV} — سنحوّل طلبك لوكيل ${ADDRESS_GOV}`
  );

  const confirm = page.getByRole("button", { name: "تأكيد الطلب" });
  await expect(confirm).toBeEnabled({ timeout: 10_000 });
  await confirm.click();
  // After a switch the page leaves with a full navigation (`window.location.assign`), so the
  // success toast is not a reliable signal — the orders page is.
  await page.waitForURL(/\/profile\/orders/, { timeout: 30_000 });

  const order = await prisma.order.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  expect(order?.assignedPartnerId).toBe(fixturePartnerId);
  // The cookie now points at the address governorate.
  const cookies = await page.context().cookies();
  const loc = cookies.find((c) => c.name === "nile_storefront_location");
  expect(decodeURIComponent(loc?.value ?? "")).toContain(ADDRESS_GOV);
  await prisma.order.deleteMany({ where: safeWhere({ userId }) });
});

test("an item the new partner lacks is removed, the notice is shown, and no order is created", async ({ page }) => {
  test.setTimeout(90_000);
  await prepare(page, [variantXId, variantYId]);
  const ordersBefore = await prisma.order.count({ where: { userId } });
  await page.goto("/checkout");
  await fillAddress(page);
  await expect(page.getByTestId("location-switch-warning")).toBeVisible();

  const confirm = page.getByRole("button", { name: "تأكيد الطلب" });
  await expect(confirm).toBeEnabled({ timeout: 10_000 });
  await confirm.click();

  // The page reloads with the removed-items notice naming Y.
  await expect(page.getByText("تم حذف بعض الأصناف من السلة").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(productYName).first()).toBeVisible();
  expect(await prisma.order.count({ where: { userId } })).toBe(ordersBefore);

  const cart = (await (await page.request.get("/api/cart")).json()).data as { items: { variantId: string }[] };
  expect(cart.items.map((i) => i.variantId)).toEqual([variantXId]);
});

test("InstaPay: the location switch and prune happen before the modal shows an amount", async ({ page }) => {
  test.setTimeout(90_000);
  await prepare(page, [variantXId, variantYId]);
  await page.goto("/checkout");
  await fillAddress(page);
  await page.getByRole("radio", { name: "الدفع عبر InstaPay" }).check();

  const confirm = page.getByRole("button", { name: "تأكيد الطلب" });
  await expect(confirm).toBeEnabled({ timeout: 10_000 });
  await confirm.click();

  // Y is pruned -> the page reloads with the notice; the amount modal never opened.
  await expect(page.getByText("تم حذف بعض الأصناف من السلة").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("dialog", { name: "الدفع عبر InstaPay" })).toHaveCount(0);
  expect(await prisma.order.count({ where: { userId } })).toBe(0);
});
