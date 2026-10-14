import { test, expect, request as playwrightRequest, type Page } from "@playwright/test";
import { loadRedesignTestEnv, ROUTING_TEST_GOVERNORATE } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { safeWhere, deleteByIds } from "./db-cleanup";

/**
 * Backlog 10.51 — admin create-order: the picker shows product codes (two same-named products
 * stay distinguishable, the search matches a SKU) and a failed create names the short items
 * with their SKU in a persistent inline alert.
 *
 * Fixture design: every row is created here and deleted by id. The partner lookup needs a rule,
 * so the spec uses ROUTING_TEST_GOVERNORATE (the one governorate reserved for specs that create
 * their own rule — see test-env.ts); it creates a rule + fixture partner and removes them in
 * afterAll through the admin API (the only thing that busts the 5-minute partner cache). Do not
 * run concurrently with other specs that create that rule (admin-v2-routing, public-pdp,
 * checkout-location-switch). Unrun at authoring time (worktree has no app env); the PM runs it.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

const prisma = new PrismaClient();
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ADMIN_PHONE = "+201099966251";
const ADMIN_PASSWORD = "CreateOrderAdmin123!";
const CUSTOMER_PHONE = "+201099966252";
const SAME_NAME = `منتج توأم ${suffix}`;

let adminUserId = "";
let customerUserId = "";
let categoryId = "";
const productIds: string[] = [];
const variantIds: string[] = [];
let partnerId = "";
let ruleId = "";
let rulePartnerId = "";
const inventoryIds: string[] = [];
const skuStocked = `TW-A-${suffix}`;
const skuShort = `TW-B-${suffix}`;
let baseURL = "";

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}
async function hash(plain: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${(await scryptAsync(plain, salt)).toString("hex")}`;
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 20_000 });
}

test.beforeAll(async () => {
  baseURL = test.info().project.use.baseURL as string;
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: "ADMIN", name: "مسؤول 10.51", passwordHash: await hash(ADMIN_PASSWORD) },
    update: { passwordHash: await hash(ADMIN_PASSWORD), role: "ADMIN" },
  });
  adminUserId = admin.id;
  const customer = await prisma.user.upsert({
    where: { phone: CUSTOMER_PHONE },
    create: {
      phone: CUSTOMER_PHONE,
      role: "CUSTOMER",
      name: `عميل 10.51 ${suffix}`,
      passwordHash: await hash("CreateOrderCust123!"),
    },
    update: {},
  });
  customerUserId = customer.id;
  await prisma.savedAddress.deleteMany({ where: safeWhere({ userId: customerUserId }) });
  await prisma.savedAddress.create({
    data: {
      userId: customerUserId,
      governorate: ROUTING_TEST_GOVERNORATE,
      city: "الخارجة",
      area: "الخارجة",
      street: "شارع الاختبار 51",
      phone: "01099966252",
      isDefault: true,
    },
  });

  const category = await prisma.category.create({
    data: { name: `فئة 10.51 ${suffix}`, slug: `create-order-cat-${suffix}`, sortOrder: 0 },
  });
  categoryId = category.id;
  // Two products with the SAME name and different SKUs.
  for (const [i, sku] of [skuStocked, skuShort].entries()) {
    const product = await prisma.product.create({
      data: {
        categoryId,
        name: SAME_NAME,
        slug: `create-order-twin-${i}-${suffix}`,
        active: true,
        weightGrams: 300,
        variants: {
          create: [
            { sku, slug: `create-order-twin-${i}-${suffix}_m`, name: "M", colorName: "أسود", pricePiastres: 10000 },
          ],
        },
      },
      include: { variants: true },
    });
    productIds.push(product.id);
    variantIds.push(product.variants[0].id);
  }

  const partner = await prisma.partner.create({
    data: {
      partnerType: "AGENT",
      name: `شريك 10.51 ${suffix}`,
      governorate: ROUTING_TEST_GOVERNORATE,
      phone: `+2010${suffix}`.slice(0, 13),
      isActive: true,
    },
  });
  partnerId = partner.id;
  const rule = await prisma.reroutingRule.create({ data: { governorate: ROUTING_TEST_GOVERNORATE, isActive: true } });
  ruleId = rule.id;
  const rp = await prisma.reroutingRulePartner.create({ data: { ruleId, partnerId, isActive: true, priority: 0 } });
  rulePartnerId = rp.id;
  // Twin A is stocked; twin B has no inventory row at all -> short.
  const inv = await prisma.partnerInventory.create({
    data: { partnerId, variantId: variantIds[0], stockAvailable: 10, stockReserved: 0 },
  });
  inventoryIds.push(inv.id);
});

test.afterAll(async () => {
  try {
    // Delete the rule through the admin API so the partner-lookup cache is busted too.
    if (ruleId) {
      const ctx = await playwrightRequest.newContext({ baseURL });
      const login = await ctx.post("/api/auth/login", { data: { phone: ADMIN_PHONE, password: ADMIN_PASSWORD } });
      if (login.ok()) await ctx.delete(`/api/admin/rerouting-rules/${ruleId}`);
      await ctx.dispose();
    }
  } catch {
    /* fall through to the direct delete */
  }
  await deleteByIds(prisma.partnerInventory, inventoryIds);
  if (rulePartnerId) await prisma.reroutingRulePartner.deleteMany({ where: safeWhere({ id: rulePartnerId }) });
  if (ruleId) await prisma.reroutingRule.deleteMany({ where: safeWhere({ id: ruleId }) });
  if (partnerId) await prisma.partner.deleteMany({ where: safeWhere({ id: partnerId }) });
  if (customerUserId) await prisma.savedAddress.deleteMany({ where: safeWhere({ userId: customerUserId }) });
  await deleteByIds(prisma.variant, variantIds);
  await deleteByIds(prisma.product, productIds);
  if (categoryId) await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await deleteByIds(prisma.user, [adminUserId, customerUserId]);
  await prisma.$disconnect();
});

test("picker shows both same-named products with their SKUs, and search by SKU finds one", async ({ page }) => {
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 1514, height: 681 });
  await page.goto("/admin/orders/new");

  const search = page.getByLabel("بحث عن صنف");
  const picker = page.getByTestId("variant-picker");

  await search.fill(SAME_NAME);
  await expect(picker.locator("option", { hasText: skuStocked })).toHaveCount(1, { timeout: 15_000 });
  await expect(picker.locator("option", { hasText: skuShort })).toHaveCount(1);
  await expect(picker.locator("option", { hasText: `${SAME_NAME} — M — أسود · ${skuStocked}` })).toHaveCount(1);

  await search.fill(skuShort);
  await expect(picker.locator("option", { hasText: skuShort })).toHaveCount(1, { timeout: 15_000 });
  await expect(picker.locator("option", { hasText: skuStocked })).toHaveCount(0);
  await page.screenshot({ path: "test-results/10.51/picker-1514x681.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/10.51/picker-390x844.png", fullPage: true });
});

test("a failed create names the short item with its SKU in a persistent inline alert", async ({ page }) => {
  await loginAsAdmin(page);
  // Bust the cached governorate -> partner lookup for the rule created straight through Prisma.
  const bust = await page.request.patch(`/api/admin/rerouting-rules/${ruleId}`, { data: { isActive: true } });
  expect(bust.ok()).toBeTruthy();

  await page.goto("/admin/orders/new");
  await page.locator("#clientSearch").fill(CUSTOMER_PHONE.replace("+20", ""));
  const clientOption = page.locator("#clientSelect option", { hasText: CUSTOMER_PHONE });
  await expect(clientOption).toHaveCount(1, { timeout: 15_000 });
  await page.locator("#clientSelect").selectOption({ value: (await clientOption.getAttribute("value")) ?? "" });
  await expect(page.locator("#addressSelect")).toBeVisible({ timeout: 15_000 });

  const search = page.getByLabel("بحث عن صنف");
  const picker = page.getByTestId("variant-picker");
  await search.fill(skuShort);
  const shortOption = picker.locator("option", { hasText: skuShort });
  await expect(shortOption).toHaveCount(1, { timeout: 15_000 });
  await picker.selectOption({ value: (await shortOption.getAttribute("value")) ?? "" });
  await page.getByRole("button", { name: "إضافة" }).click();
  // The selected-items table shows the SKU under the name.
  await expect(page.locator("li", { hasText: skuShort })).toBeVisible();

  const submit = page.getByRole("button", { name: "إنشاء الطلب" });
  await expect(submit).toBeEnabled({ timeout: 15_000 });
  await submit.click();

  const alert = page.getByTestId("create-order-error");
  await expect(alert).toBeVisible({ timeout: 20_000 });
  await expect(alert).toHaveAttribute("role", "alert");
  await expect(alert).toContainText("الناقص لدى");
  const item = alert.getByTestId("create-order-short-item");
  await expect(item).toHaveCount(1);
  await expect(item).toContainText(SAME_NAME);
  await expect(item).toContainText(skuShort);
  // Persistent: still there after the toast would have gone.
  await page.waitForTimeout(6_000);
  await expect(alert).toBeVisible();
  await page.screenshot({ path: "test-results/10.51/error-1514x681.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/10.51/error-390x844.png", fullPage: true });
});
