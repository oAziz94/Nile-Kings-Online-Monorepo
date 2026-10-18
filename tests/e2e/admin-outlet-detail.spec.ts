import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";
import { cairoDateIso, cairoStartOfDayUtc } from "../../lib/analytics/cairo-day";

/**
 * Backlog 11.6 (admin outlet detail). Fixtures are this spec's own: an AGENT + outlet pair
 * (the outlet gets a store name/address, a high low-stock threshold so an online queue would flag it,
 * and stock already reduced by its sales: v1 7, v2 9), one category / product / two variants, an
 * admin user, and three StoreSales written through Prisma (2 today, 1 yesterday, Cairo days):
 *   #1 today CASH v1 x2 (200)   #2 today INSTAPAY v2 x1 (250)   #3 yesterday CARD v1 x1 (100)
 * plus one outlet created from the create dialog. Cleanup is by id.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const prisma = new PrismaClient();
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ADMIN_PHONE = "+201099966412";
const ADMIN_PASSWORD = "OutletDetailAdmin123!";
const CREATED_LOCAL_PHONE = `10${String(Date.now()).slice(-8)}`;
const CREATED_NAME = `منفذ جديد ${suffix}`;
const OUTLET_NAME = `منفذ اختبار ${suffix}`;
const STORE_NAME = `متجر ${suffix}`;
const STORE_ADDRESS = "شارع التحرير، الجيزة";

let pair: PartnerFixturePair;
let adminUserId: string;
let categoryId: string;
let productId: string;
let v1: string;
let v2: string;
let createdPartnerId = "";
const saleIds: Record<1 | 2 | 3, string> = { 1: "", 2: "", 3: "" };

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}
async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${(await scryptAsync(plain, salt)).toString("hex")}`;
}

async function stock(variantId: string) {
  return prisma.partnerInventory.findUniqueOrThrow({
    where: { partnerId_variantId: { partnerId: pair.distributor.partnerId, variantId } },
  });
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 20_000 });
}

test.beforeAll(async () => {
  adminUserId = (
    await prisma.user.upsert({
      where: { phone: ADMIN_PHONE },
      create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: "مسؤول تفاصيل المنفذ" },
      update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
    })
  ).id;

  pair = await seedPartnerPair(prisma);
  const partnerId = pair.distributor.partnerId;
  await prisma.partner.update({
    where: { id: partnerId },
    data: { name: OUTLET_NAME, storeName: STORE_NAME, storeAddress: STORE_ADDRESS, lowStockThreshold: 100 },
  });
  categoryId = (await prisma.category.create({ data: { name: `فئة منفذ ${suffix}`, slug: `odet-cat-${suffix}` } })).id;
  productId = (
    await prisma.product.create({ data: { categoryId, name: `منتج منفذ ${suffix}`, slug: `odet-product-${suffix}`, active: true } })
  ).id;
  v1 = (await prisma.variant.create({ data: { productId, sku: `ODET-A-${suffix}`, name: "M", colorName: "أحمر", pricePiastres: 10000 } })).id;
  v2 = (await prisma.variant.create({ data: { productId, sku: `ODET-B-${suffix}`, name: "L", colorName: "أزرق", pricePiastres: 25000 } })).id;
  await prisma.partnerInventory.create({ data: { partnerId, variantId: v1, stockAvailable: 7, stockReserved: 0 } });
  await prisma.partnerInventory.create({ data: { partnerId, variantId: v2, stockAvailable: 9, stockReserved: 0 } });

  const now = new Date();
  const yesterday = new Date(cairoStartOfDayUtc(cairoDateIso(now)).getTime() - 3 * 3_600_000);
  const line = (variantId: string, sku: string, size: string, colour: string, quantity: number, unitPricePiastres: number) => ({
    variantId,
    quantity,
    unitPricePiastres,
    productName: `منتج منفذ ${suffix}`,
    variantName: `${size} – ${colour}`,
    sku,
  });
  const mk = async (
    n: 1 | 2 | 3,
    data: { paymentMethod: "CASH" | "INSTAPAY" | "CARD"; soldAt: Date; subtotalPiastres: number },
    items: ReturnType<typeof line>[]
  ) => {
    saleIds[n] = (
      await prisma.storeSale.create({
        data: { partnerId, receiptNo: n, recordedByUserId: pair.distributor.userId, ...data, items: { create: items } },
      })
    ).id;
  };
  await mk(1, { paymentMethod: "CASH", soldAt: new Date(now.getTime() - 60_000), subtotalPiastres: 20000 }, [
    line(v1, `ODET-A-${suffix}`, "M", "أحمر", 2, 10000),
  ]);
  await mk(2, { paymentMethod: "INSTAPAY", soldAt: now, subtotalPiastres: 25000 }, [line(v2, `ODET-B-${suffix}`, "L", "أزرق", 1, 25000)]);
  await mk(3, { paymentMethod: "CARD", soldAt: yesterday, subtotalPiastres: 10000 }, [line(v1, `ODET-A-${suffix}`, "M", "أحمر", 1, 10000)]);
});

test.afterAll(async () => {
  const partnerId = pair?.distributor?.partnerId;
  const created = createdPartnerId ? [createdPartnerId] : [];
  const auditIds = [...Object.values(saleIds), ...created].filter(Boolean);
  if (adminUserId) {
    await prisma.adminAuditLog.deleteMany({ where: safeWhere({ OR: [{ actorUserId: adminUserId }, { entityId: { in: auditIds } }] }) });
  }
  if (partnerId) {
    await prisma.storeSaleItem.deleteMany({ where: safeWhere({ sale: { partnerId } }) });
    await prisma.storeSale.deleteMany({ where: safeWhere({ partnerId }) });
  }
  if (v1 && v2) {
    await prisma.inventoryLedger.deleteMany({ where: safeWhere({ variantId: { in: [v1, v2] } }) });
    await prisma.stockReceiptLine.deleteMany({ where: safeWhere({ variantId: { in: [v1, v2] } }) });
    await prisma.partnerInventory.deleteMany({ where: safeWhere({ variantId: { in: [v1, v2] } }) });
    await prisma.variant.deleteMany({ where: safeWhere({ id: { in: [v1, v2] } }) });
  }
  if (productId) await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
  if (categoryId) await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  if (pair) await cleanupPartnerPair(prisma, pair, { partnerIds: created });
  if (adminUserId) await prisma.user.deleteMany({ where: safeWhere({ id: adminUserId }) });
  await prisma.$disconnect();
});

test("create dialog: choosing منفذ shows no linked-agent field; the outlet is created without an agent", async ({ page }) => {
  await page.setViewportSize({ width: 1514, height: 681 });
  await loginAsAdmin(page);
  await page.goto("/admin/partners");
  await page.getByRole("button", { name: "شريك جديد" }).click();

  await page.getByLabel("نوع الشريك *").selectOption({ label: "منفذ" });
  await expect(page.getByText("الوكيل المرتبط")).toHaveCount(0);
  await page.getByLabel("الاسم *").fill(CREATED_NAME);
  await page.getByLabel("المحافظة *").selectOption({ label: "القاهرة" });
  await page.getByLabel("رقم التليفون *").fill(`0${CREATED_LOCAL_PHONE}`);
  await page.getByRole("button", { name: "إضافة", exact: true }).click();

  await expect
    .poll(async () => (await prisma.partner.findFirst({ where: { name: CREATED_NAME } }))?.id ?? "", { timeout: 20_000 })
    .not.toBe("");
  const created = await prisma.partner.findFirstOrThrow({ where: { name: CREATED_NAME } });
  createdPartnerId = created.id;
  expect(created.partnerType).toBe("DISTRIBUTOR");

});

test("a new outlet's detail shows exactly four tabs and no agent row", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  await page.goto(`/admin/partners/${createdPartnerId}`);
  await expect(page.getByText(CREATED_NAME, { exact: true }).first()).toBeVisible({ timeout: 20_000 });

  const tabs = page.getByRole("tablist", { name: "أقسام ملف الشريك" }).getByRole("tab");
  await expect(tabs).toHaveCount(4);
  await expect(tabs).toHaveText(["المخزون", "المبيعات", "الاستلامات", "الإعدادات"]);
  await expect(page.getByRole("tab", { name: "الأداء" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "الحساب المالي" })).toHaveCount(0);

  await page.getByRole("tab", { name: "المبيعات" }).click();
  await expect(page.getByTestId("kpi-count")).toHaveText("0");
  await page.getByRole("tab", { name: "الاستلامات" }).click();
  await expect(page.getByText("لا توجد استلامات مسجّلة")).toBeVisible();
  await expect(page.getByRole("button", { name: "تسجيل استلام باسمه" })).toBeVisible();
  await page.getByRole("tab", { name: "الإعدادات" }).click();
  await expect(page.getByTestId("outlet-settings")).toBeVisible();
  await expect(page.getByText("الوكيل المرتبط")).toHaveCount(0);
  await page.getByRole("button", { name: "تعديل" }).click();
  await expect(page.getByText("الوكيل المرتبط")).toHaveCount(0);
});

test("sales tab lists the seeded sales with totals, filters and a receipt drawer", async ({ page }) => {
  await page.setViewportSize({ width: 1514, height: 681 });
  await loginAsAdmin(page);
  await page.goto(`/admin/partners/${pair.distributor.partnerId}`);
  await expect(page.getByTestId("outlet-store")).toContainText(STORE_NAME);
  await expect(page.getByTestId("outlet-store")).toContainText(STORE_ADDRESS);
  await expect(page.getByRole("tablist", { name: "أقسام ملف الشريك" }).getByRole("tab")).toHaveCount(4);
  await expect(page.getByText("تابع لـ")).toHaveCount(0);

  await page.getByRole("tab", { name: "المبيعات" }).click();
  await expect(page.getByTestId("kpi-count")).toHaveText("2");
  await expect(page.getByTestId("kpi-revenue")).toHaveText("450");
  await expect(page.getByTestId("kpi-voided")).toHaveText("0");
  await expect(page.getByTestId("sale-row")).toHaveCount(2);
  // no "بيع جديد" in the admin view
  await expect(page.getByRole("link", { name: "بيع جديد" })).toHaveCount(0);

  await page.getByRole("radio", { name: "7 أيام" }).click();
  await expect(page.getByTestId("kpi-count")).toHaveText("3");
  await expect(page.getByTestId("kpi-revenue")).toHaveText("550");
  await page.getByRole("radio", { name: "بطاقة" }).click();
  await expect(page.getByTestId("sale-row")).toHaveCount(1);
  await page.getByRole("radio", { name: "الكل" }).click();
  await expect(page.getByTestId("sale-row")).toHaveCount(3);

  // receipt drawer with reprint
  await page.locator('[data-testid="sale-row"][data-receipt="2"]').click();
  const drawer = page.getByTestId("sale-drawer");
  await expect(drawer.getByTestId("screen-total")).toHaveText("250", { timeout: 20_000 });
  await expect(drawer.getByTestId("receipt-print")).toBeVisible();
  await expect(drawer.getByTestId("void-open")).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();

  // the list endpoint is outlet-only
  const agentRes = await page.request.get(`/api/admin/partners/${pair.agent.partnerId}/sales`);
  expect(agentRes.status()).toBe(400);
});

test("sales list endpoint refuses a caller who is not an admin", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(pair.distributor.localPhone);
  await page.getByLabel("كلمة المرور").fill(pair.password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  const res = await page.request.get(`/api/admin/partners/${pair.distributor.partnerId}/sales`);
  expect([401, 403]).toContain(res.status());
  const detail = await page.request.get(`/api/admin/partners/${pair.distributor.partnerId}/sales/${saleIds[1]}`);
  expect([401, 403]).toContain(detail.status());
});

test("admin voids yesterday's receipt from the drawer: reason required, stock back, audited", async ({ page }) => {
  await page.setViewportSize({ width: 1514, height: 681 });
  await loginAsAdmin(page);
  await page.goto(`/admin/partners/${pair.distributor.partnerId}?tab=sales`);
  await page.getByRole("radio", { name: "أمس" }).click();
  await expect(page.getByTestId("sale-row")).toHaveCount(1);
  await page.locator('[data-testid="sale-row"][data-receipt="3"]').click();

  const drawer = page.getByTestId("sale-drawer");
  await expect(drawer.getByTestId("void-open")).toBeEnabled({ timeout: 20_000 });
  await drawer.getByTestId("void-open").click();
  await expect(page.getByTestId("void-confirm")).toBeDisabled();
  await page.getByTestId("void-reason").fill("ab");
  await expect(page.getByTestId("void-confirm")).toBeDisabled();
  await page.getByTestId("void-reason").fill("إلغاء من الإدارة بعد المراجعة");
  await page.getByTestId("void-confirm").click();

  await expect(drawer.getByTestId("void-info")).toContainText("هذا الإيصال ملغي", { timeout: 20_000 });
  await expect(drawer.getByTestId("void-reason-text")).toHaveText("إلغاء من الإدارة بعد المراجعة");

  expect((await stock(v1)).stockAvailable).toBe(8);
  const sale = await prisma.storeSale.findUniqueOrThrow({ where: { id: saleIds[3] } });
  expect(sale.status).toBe("VOIDED");
  const audit = await prisma.adminAuditLog.findMany({ where: { entityId: saleIds[3], action: "void_sale" } });
  expect(audit).toHaveLength(1);
  expect(audit[0].actorUserId).toBe(adminUserId);
  expect(audit[0].reason).toBe("إلغاء من الإدارة بعد المراجعة");
  const ledger = await prisma.inventoryLedger.findMany({ where: { partnerId: pair.distributor.partnerId, reason: "STORE_SALE_VOID" } });
  expect(ledger).toHaveLength(1);
  expect(ledger[0].quantityAvailableDelta).toBe(1);

  // the list behind the drawer refreshed: voided badge on yesterday's row, KPI shows one voided
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-testid="sale-row"][data-receipt="3"]').getByTestId("void-badge")).toBeVisible();
  await expect(page.getByTestId("kpi-voided")).toHaveText("1");
});

test("receipts tab shows an admin-recorded intake and has no cost columns", async ({ page }) => {
  await loginAsAdmin(page);
  const res = await page.request.post(`/api/admin/partners/${pair.distributor.partnerId}/receipts`, {
    data: { kind: "FACTORY", reference: `ODET-${suffix}`, lines: [{ variantId: v2, quantity: 5 }] },
  });
  expect(res.status()).toBe(201);
  expect((await stock(v2)).stockAvailable).toBe(14);

  await page.setViewportSize({ width: 1514, height: 681 });
  await page.goto(`/admin/partners/${pair.distributor.partnerId}?tab=receipts`);
  const row = page.getByTestId("receipt-row").filter({ hasText: `ODET-${suffix}` });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("المصنع (أنت)");
  await expect(row).toContainText("5");
  await expect(page.getByRole("columnheader", { name: "القيمة بالتكلفة" })).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "النسبة وقتها" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "تسجيل استلام باسمه" })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(row).toBeVisible();
});

test("partners list: outlet chip, مستحق للمصنع reads a dash, type filter; the outlet is absent from admin اليوم", async ({ page }) => {
  await page.setViewportSize({ width: 1514, height: 681 });
  await loginAsAdmin(page);
  await page.goto("/admin/partners");
  const outletRow = page.locator("tr").filter({ has: page.getByText(OUTLET_NAME, { exact: true }) }).first();
  await expect(outletRow).toBeVisible({ timeout: 20_000 });
  await expect(outletRow.getByTestId("outlet-chip")).toHaveText("منفذ");
  await expect(outletRow.getByTestId("balance-dash")).toHaveText("—");
  await expect(outletRow.getByText("تابع لـ")).toHaveCount(0);

  const agentRow = page.locator("tr").filter({ has: page.getByText(pair.agent.name, { exact: true }) }).first();
  await expect(agentRow).toBeVisible();
  await expect(agentRow.getByTestId("outlet-chip")).toHaveCount(0);

  await page.getByRole("combobox", { name: "النوع" }).selectOption("DISTRIBUTOR");
  await expect(outletRow).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("tr").filter({ has: page.getByText(pair.agent.name, { exact: true }) })).toHaveCount(0);

  // admin اليوم: no queue carries the outlet (its stock is low against its threshold of 100)
  const today = await page.request.get("/api/admin/today");
  expect(today.status()).toBe(200);
  const body = JSON.stringify(await today.json());
  expect(body).not.toContain(pair.distributor.partnerId);
  expect(body).not.toContain(OUTLET_NAME);
});
