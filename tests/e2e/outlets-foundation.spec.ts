import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv, ROUTING_TEST_GOVERNORATE } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { seedPartnerPair, cleanupPartnerPair, hashPassword, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 11.1 (outlets foundation). Fixtures are this spec's own: an admin, an AGENT and an
 * outlet (DISTRIBUTOR) from `seedPartnerPair`, one category/product/variant with stock held by
 * BOTH partners, and one ReroutingRule created through the admin API for
 * `ROUTING_TEST_GOVERNORATE` (the one governorate reserved for specs that create a rule) and
 * deleted through the API in afterAll, which also busts the 5-minute storefront rule cache.
 *
 * Covers: (1) the rules API refuses an outlet (400, exact message) and the routing tab's picker
 * lists the agent but not the outlet; (2) the outlet's stock changes neither the admin product
 * detail "partnerCount" nor the Excel export quantity (the products list has no stock column
 * today, so the detail endpoint and the export are the two admin stock surfaces); (3) the public
 * /partners page shows the outlet copy.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const prisma = new PrismaClient();

const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ADMIN_PHONE = "+201099966611";
const ADMIN_LOCAL = ADMIN_PHONE.replace("+20", "");
const ADMIN_PASSWORD = "AdminOutletsTest123!";

let adminUserId: string;
let pair: PartnerFixturePair;
let agentName: string;
let outletName: string;
let categoryId: string;
let productId: string;
let variantId: string;
let sku: string;
let ruleId: string | undefined;

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_LOCAL);
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 20_000 });
}

test.beforeAll(async () => {
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: `مسؤول اختبار المنافذ ${uniqueSuffix}` },
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
  });
  adminUserId = admin.id;

  pair = await seedPartnerPair(prisma);
  // The pair's default display names are shared by every spec; make them unique so the picker
  // assertions can tell this spec's partners apart from other fixtures' rows.
  agentName = `وكيل المنافذ ${uniqueSuffix}`;
  outletName = `منفذ الاختبار ${uniqueSuffix}`;
  await prisma.partner.update({ where: { id: pair.agent.partnerId }, data: { name: agentName } });
  await prisma.partner.update({ where: { id: pair.distributor.partnerId }, data: { name: outletName } });

  const category = await prisma.category.create({
    data: { name: `فئة المنافذ ${uniqueSuffix}`, slug: `outlets-cat-${uniqueSuffix}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج المنافذ ${uniqueSuffix}`, slug: `outlets-product-${uniqueSuffix}`, active: true },
  });
  productId = product.id;
  sku = `OUTLETS-${uniqueSuffix}`;
  const variant = await prisma.variant.create({
    data: { productId, sku, name: "M", colorName: "أحمر", pricePiastres: 10000 },
  });
  variantId = variant.id;

  await prisma.partnerInventory.create({ data: { partnerId: pair.agent.partnerId, variantId, stockAvailable: 10, stockReserved: 0 } });
  await prisma.partnerInventory.create({ data: { partnerId: pair.distributor.partnerId, variantId, stockAvailable: 7, stockReserved: 0 } });
});

test.afterAll(async ({ browser }) => {
  // The rule goes through the API so revalidateReroutingRules() busts the storefront cache.
  if (ruleId) {
    const context = await browser.newContext({ baseURL: `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3100}` });
    try {
      const page = await context.newPage();
      await loginAsAdmin(page);
      await page.request.delete(`/api/admin/rerouting-rules/${ruleId}`);
    } finally {
      await context.close();
    }
    // Belt and braces: the id is ours, so a leftover row can only be ours.
    await prisma.reroutingRulePartner.deleteMany({ where: safeWhere({ ruleId }) });
    await prisma.reroutingRule.deleteMany({ where: safeWhere({ id: ruleId }) });
  }
  await prisma.adminAuditLog.deleteMany({ where: safeWhere({ actorUserId: adminUserId }) });
  await prisma.inventoryLedger.deleteMany({ where: safeWhere({ variantId }) });
  await prisma.partnerInventory.deleteMany({ where: safeWhere({ variantId }) });
  await prisma.variant.deleteMany({ where: safeWhere({ id: variantId }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await cleanupPartnerPair(prisma, pair);
  await prisma.user.deleteMany({ where: safeWhere({ id: adminUserId }) });
  await prisma.$disconnect();
});

test("the rules API refuses an outlet and the routing picker lists agents only", async ({ page }) => {
  await loginAsAdmin(page);

  const created = await page.request.post("/api/admin/rerouting-rules", {
    data: { governorate: ROUTING_TEST_GOVERNORATE, isActive: true },
  });
  expect(created.ok()).toBe(true);
  ruleId = (await created.json()).data.id as string;

  const refused = await page.request.post(`/api/admin/rerouting-rules/${ruleId}/partners`, {
    data: { partnerId: pair.distributor.partnerId },
  });
  expect(refused.status()).toBe(400);
  expect((await refused.json()).error.message).toBe("المنافذ لا تستقبل طلبات أونلاين");
  expect(await prisma.reroutingRulePartner.count({ where: safeWhere({ ruleId, partnerId: pair.distributor.partnerId }) })).toBe(0);

  await page.goto(`/admin/partners?tab=routing&q=${encodeURIComponent(ROUTING_TEST_GOVERNORATE)}`);
  const row = page.getByTestId(`routing-row-${ROUTING_TEST_GOVERNORATE}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole("button", { name: "إضافة" }).click();

  const picker = page.getByLabel("اختر الشريك");
  await expect(picker.locator("option", { hasText: agentName })).toHaveCount(1, { timeout: 15_000 });
  await expect(picker.locator("option", { hasText: outletName })).toHaveCount(0);

  // The agent is still addable.
  const ok = await page.request.post(`/api/admin/rerouting-rules/${ruleId}/partners`, {
    data: { partnerId: pair.agent.partnerId },
  });
  expect(ok.ok()).toBe(true);
});

test("outlet stock does not change the admin product detail count or the Excel export", async ({ page }) => {
  await loginAsAdmin(page);

  const detail = await page.request.get(`/api/admin/products/${productId}`);
  expect(detail.ok()).toBe(true);
  const variants = (await detail.json()).data.variants as { id: string; partnerCount: number }[];
  expect(variants.find((v) => v.id === variantId)?.partnerCount).toBe(1); // the agent only, not 2

  const exported = await page.request.get("/api/admin/products/export-excel");
  expect(exported.ok()).toBe(true);
  const wb = XLSX.read(await exported.body(), { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]]);
  const line = rows.find((r) => r.id === sku);
  expect(line).toBeTruthy();
  expect(Number(line!.quantity)).toBe(10); // not 17
});

test("the public /partners page shows the outlet copy", async ({ page, baseURL }) => {
  await page.context().addCookies([
    {
      name: "nile_storefront_location",
      value: encodeURIComponent(JSON.stringify({ governorate: "القاهرة", area: "مدينة نصر" })),
      url: baseURL ?? "http://localhost:3100",
    },
  ]);
  await page.goto("/partners");
  await expect(page.getByText("المنفذ يبيع من متجره ويستلم بضاعته من المصنع")).toBeVisible();
  await expect(page.getByRole("radio", { name: "منفذ" })).toBeVisible();
  await expect(page.getByText("موزع", { exact: false })).toHaveCount(0);

  await page.goto("/partners?type=distributor");
  await expect(page.getByRole("heading", { name: "طلب تسجيل منفذ" })).toBeVisible();
});
