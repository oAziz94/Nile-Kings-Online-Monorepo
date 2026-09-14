import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

/**
 * Backlog 9.4a (الشركاء hub: list, profile tabs, applications, the two ownership changes)
 * coverage. Serial mode, one shared fixture set (admin + agent + linked distributor +
 * variant + inventory + one overdue order + one receipt + one payment with a past `dueAt`),
 * `afterAll` cleanup of every row created.
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

const ADMIN_PHONE = "+201099966301";
const ADMIN_PASSWORD = "AdminPartnersTest123!";
const ADMIN_NAME = "مسؤول اختبار الشركاء";
const CUSTOMER_PHONE = "+201099966302";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

let adminUserId: string;
let customerUserId: string;
let pair: PartnerFixturePair;

let categoryId: string;
let productId: string;
let variantId: string;
let variantSku: string;
let overdueOrderId: string;
let partnerReceiptId: string;
let paymentId: string;

let requestId: string; // partner application, approved+converted during the test

const allOrderIds: string[] = [];
const allReceiptIds: string[] = [];
const allPaymentIds: string[] = [];

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
    create: { phone: CUSTOMER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword("AdminPartnersCust123!"), name: `عميل الشركاء ${uniqueSuffix}` },
    update: {},
  });
  customerUserId = customer.id;

  // Short confirmSlaHours so one seeded order is overdue on arrival (backdated createdAt).
  pair = await seedPartnerPair(prisma, { agent: { confirmSlaHours: 1 } });

  const category = await prisma.category.create({
    data: { name: `فئة شركاء ${uniqueSuffix}`, slug: `admin-partners-cat-${uniqueSuffix}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج شركاء ${uniqueSuffix}`, slug: `admin-partners-product-${uniqueSuffix}`, active: true, weightGrams: 300 },
  });
  productId = product.id;
  const variant = await prisma.variant.create({
    data: { productId, sku: `AP-${uniqueSuffix}`, name: "M", colorName: "أزرق", pricePiastres: 10000 },
  });
  variantId = variant.id;
  variantSku = variant.sku;

  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId, stockAvailable: 20, stockReserved: 0 },
  });

  // One overdue order (CREATED, backdated past the 1h confirmSlaHours).
  const order = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "CREATED",
      assignedPartnerId: pair.agent.partnerId,
      subtotalPiastres: 10000,
      totalPiastres: 10000,
      shippingAddress: { governorate: "القاهرة", city: "القاهرة", area: "مدينة نصر" },
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      items: {
        create: [
          {
            variantId,
            productName: product.name,
            variantName: `${product.slug}-${variant.sku}`,
            sku: variant.sku,
            quantity: 1,
            unitPricePiastres: 10000,
            totalPiastres: 10000,
          },
        ],
      },
    },
  });
  overdueOrderId = order.id;
  allOrderIds.push(order.id);

  // One partner-recorded receipt (via prisma directly, to seed a fixed comparison point).
  const receipt = await prisma.stockReceipt.create({
    data: { partnerId: pair.agent.partnerId, kind: "FACTORY", reference: `seed-${uniqueSuffix}`, recordedBy: "PARTNER" },
  });
  partnerReceiptId = receipt.id;
  allReceiptIds.push(receipt.id);

  // One payment with a past dueAt (so the balance/queue math has a real due date).
  const payment = await prisma.partnerPayment.create({
    data: {
      partnerId: pair.agent.partnerId,
      kind: "INSTALLMENT",
      amountPiastres: 100_00,
      paidAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      dueAt: new Date(Date.now() - 1 * 60 * 60 * 1000),
      reference: `seed-pay-${uniqueSuffix}`,
      recordedByUserId: adminUserId,
    },
  });
  paymentId = payment.id;
  allPaymentIds.push(payment.id);

  // One partner application, approved + converted during the applications-tab test.
  const request = await prisma.partnerRequest.create({
    data: {
      requestType: "AGENT",
      name: `متقدم شركاء ${uniqueSuffix}`,
      governorate: "الجيزة",
      phone: `+201099${String(Date.now()).slice(-6)}`,
      status: "PENDING",
    },
  });
  requestId = request.id;
});

test.afterAll(async () => {
  await prisma.adminAuditLog.deleteMany({ where: { entityId: { in: [pair.agent.partnerId, ...allReceiptIds] } } });
  await prisma.inventoryLedger.deleteMany({ where: { OR: [{ orderId: { in: allOrderIds } }, { partnerId: pair.agent.partnerId }] } });
  await prisma.orderAuditLog.deleteMany({ where: { orderId: { in: allOrderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: allOrderIds } } });
  await prisma.partnerPayment.deleteMany({ where: { id: { in: allPaymentIds } } });
  await prisma.stockReceiptLine.deleteMany({ where: { receiptId: { in: allReceiptIds } } });
  await prisma.stockReceipt.deleteMany({ where: { id: { in: allReceiptIds } } });
  await prisma.partnerRequest.deleteMany({ where: { id: requestId } });
  const converted = await prisma.partner.findFirst({ where: { name: { contains: uniqueSuffix } } });
  if (converted) await prisma.partner.deleteMany({ where: { id: converted.id, phone: { not: pair.agent.phone } } });
  await prisma.partnerInventory.deleteMany({ where: { variantId } });
  await prisma.variant.deleteMany({ where: { id: variantId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, customerUserId] } } });
  await prisma.$disconnect();
});

test("list shows the health columns with the expected numbers", async ({ page }) => {
  await loginAsAdmin(page);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/admin/partners?health=1"), { timeout: 20_000 }),
    page.goto("/admin/partners"),
  ]);
  const row = page.locator("tr").filter({ has: page.getByText(pair.agent.name, { exact: true }) }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("1"); // overdue count
});

test("يحتاج انتباه filter keeps the fixture (overdue > 0)", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/partners");
  await page.getByRole("button", { name: "يحتاج انتباه" }).click();
  await expect(page.locator("tr").filter({ has: page.getByText(pair.agent.name, { exact: true }) }).first()).toBeVisible({ timeout: 20_000 });
});

test("open profile, edit الملف round-trip", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/partners/${pair.agent.partnerId}`);
  await expect(page.getByText(pair.agent.name).first()).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "تعديل" }).click();
  const nameInput = page.locator("#partner-edit-name");
  await nameInput.fill(`${pair.agent.name} المعدّل`);
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText(`${pair.agent.name} المعدّل`).first()).toBeVisible({ timeout: 20_000 });

  // Restore for the remaining tests.
  await page.getByRole("button", { name: "تعديل" }).click();
  await page.locator("#partner-edit-name").fill(pair.agent.name);
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText(`${pair.agent.name} المعدّل`)).toHaveCount(0, { timeout: 20_000 });
  await expect(page.getByText(pair.agent.name, { exact: true }).first()).toBeVisible();
});

test("الطلبات tab lists only this partner's orders", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/partners/${pair.agent.partnerId}?tab=orders`);
  await expect(page.getByText(`#${overdueOrderId.slice(0, 8)}`)).toBeVisible({ timeout: 20_000 });
});

test("المخزون correction writes a MANUAL_ADJUSTMENT ledger row", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/partners/${pair.agent.partnerId}?tab=stock`);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/admin/partner-inventory") && r.url().includes("q="), { timeout: 20_000 }),
    page.getByPlaceholder("بحث بالمنتج أو SKU…").fill(variantSku),
  ]);
  const row = page.locator("tr", { hasText: variantSku }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  const qtyInput = row.locator("input").first();
  await qtyInput.fill("25");
  await row.getByRole("button").last().click();
  await expect
    .poll(async () => {
      const rows = await prisma.inventoryLedger.findMany({ where: { partnerId: pair.agent.partnerId, variantId, reason: "MANUAL_ADJUSTMENT" } });
      return rows.length;
    })
    .toBeGreaterThan(0);
});

test("الحساب المالي: record a receipt on behalf, compare arithmetic against a partner-recorded one; record a payment", async ({ page, browser }) => {
  await loginAsAdmin(page);

  const adminReceiptRes = await page.request.post(`/api/admin/partners/${pair.agent.partnerId}/receipts`, {
    data: { kind: "FACTORY", lines: [{ variantId, quantity: 4 }], reference: `admin-${uniqueSuffix}` },
  });
  expect(adminReceiptRes.ok()).toBeTruthy();
  const adminReceiptJson = await adminReceiptRes.json();
  allReceiptIds.push(adminReceiptJson.data.id);
  expect(adminReceiptJson.data.recordedBy).toBe("ADMIN");

  const adminUnitCost = adminReceiptJson.data.lines[0].unitCostPiastres as number;
  const adminTotalCost = adminReceiptJson.data.totalCostPiastres as number;
  expect(adminTotalCost).toBe(adminUnitCost * 4);

  // The same lines recorded via the partner route, in an independent browser context (so it
  // doesn't disturb this test's admin session) — the arithmetic must match exactly, since
  // both routes call the same `applyStockReceipt` transaction (B3).
  const partnerContext = await browser.newContext();
  const partnerPage = await partnerContext.newPage();
  await partnerPage.goto("/login");
  await partnerPage.getByLabel("رقم الهاتف").fill(pair.agent.localPhone);
  await partnerPage.getByLabel("كلمة المرور").fill(pair.password);
  await partnerPage.getByRole("button", { name: "تسجيل الدخول" }).click();
  await partnerPage.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  const partnerReceiptRes = await partnerPage.request.post("/api/partner/receipts", {
    data: { kind: "FACTORY", lines: [{ variantId, quantity: 4 }], reference: `partner-${uniqueSuffix}` },
  });
  expect(partnerReceiptRes.ok()).toBeTruthy();
  const partnerReceiptJson = await partnerReceiptRes.json();
  allReceiptIds.push(partnerReceiptJson.data.id);
  await partnerContext.close();

  const partnerUnitCost = partnerReceiptJson.data.lines[0].unitCostPiastres as number;
  const partnerTotalCost = partnerReceiptJson.data.totalCostPiastres as number;
  expect(partnerUnitCost).toBe(adminUnitCost);
  expect(partnerTotalCost).toBe(adminTotalCost);

  const auditRow = await prisma.adminAuditLog.findFirst({
    where: { entityType: "receipt", entityId: adminReceiptJson.data.id },
  });
  expect(auditRow).toBeTruthy();

  await page.goto(`/admin/partners/${pair.agent.partnerId}?tab=finance`);
  await expect(page.getByText("المصنع (أنت)").first()).toBeVisible({ timeout: 20_000 });

  const balanceBefore = await page.request.get(`/api/admin/partners/${pair.agent.partnerId}/finance`);
  const balanceBeforeJson = await balanceBefore.json();
  const balancePiastresBefore = balanceBeforeJson.data.balancePiastres as number;

  const paymentRes = await page.request.post(`/api/admin/partners/${pair.agent.partnerId}/payments`, {
    data: { kind: "DOWN_PAYMENT", amountPiastres: 50_00, paidAt: new Date().toISOString(), reference: `pay-${uniqueSuffix}` },
  });
  expect(paymentRes.ok()).toBeTruthy();
  const paymentJson = await paymentRes.json();
  allPaymentIds.push(paymentJson.data.id);

  const balanceAfter = await page.request.get(`/api/admin/partners/${pair.agent.partnerId}/finance`);
  const balanceAfterJson = await balanceAfter.json();
  expect(balanceAfterJson.data.balancePiastres).toBe(balancePiastresBefore - 50_00);
});

test("الإعدادات: change confirm SLA → audit row with before/after; partner settings page read-only", async ({ page }) => {
  await loginAsAdmin(page);
  const patchRes = await page.request.patch(`/api/admin/partners/${pair.agent.partnerId}`, {
    data: { confirmSlaHours: 15 },
  });
  expect(patchRes.ok()).toBeTruthy();

  const auditRow = await prisma.adminAuditLog.findFirst({
    where: { entityType: "partner", entityId: pair.agent.partnerId, action: "update" },
    orderBy: { createdAt: "desc" },
  });
  expect(auditRow?.after).toMatchObject({ confirmSlaHours: 15 });

  const partnerPatchRes = await page.request.patch("/api/partner/settings", { data: { confirmSlaHours: 5 } });
  // Signed in as admin here, not the partner — this just confirms the route still rejects
  // the field at all regardless of caller; the partner-side 400 is covered in
  // partner-v2-foundation.spec.ts's dedicated SLA-ownership test.
  expect(partnerPatchRes.status()).not.toBe(200);

  // Restore for later tests / other suites reading this fixture.
  await prisma.partner.update({ where: { id: pair.agent.partnerId }, data: { confirmSlaHours: 1 } });
});

test("applications tab: approve + convert creates the partner", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/partners");
  await page.getByRole("tab", { name: /طلبات الشراكة/ }).click();
  const row = page.locator("tr", { hasText: uniqueSuffix }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "قبول وتحويل" }).click();
  await page.getByRole("button", { name: "تحويل" }).click();
  await expect
    .poll(async () => {
      const updated = await prisma.partnerRequest.findUnique({ where: { id: requestId } });
      return updated?.status;
    })
    .toBe("APPROVED");
  const created = await prisma.partner.findFirst({ where: { name: { contains: uniqueSuffix }, partnerType: "AGENT" } });
  expect(created).toBeTruthy();
});

test("/admin/partner-inventory?partnerId= redirects to the profile's stock tab", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/partner-inventory?partnerId=${pair.agent.partnerId}`);
  await expect(page).toHaveURL(`/admin/partners/${pair.agent.partnerId}?tab=stock`, { timeout: 20_000 });
});

test("401 signed-out, 403 for a customer on the new routes", async ({ page, browser }) => {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(CUSTOMER_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill("AdminPartnersCust123!");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
  const res = await page.request.post(`/api/admin/partners/${pair.agent.partnerId}/receipts`, {
    data: { kind: "FACTORY", lines: [{ variantId, quantity: 1 }] },
  });
  expect(res.status()).toBe(403);

  const context = await browser.newContext();
  const guestPage = await context.newPage();
  const guestRes = await guestPage.request.post(`/api/admin/partners/${pair.agent.partnerId}/receipts`, {
    data: { kind: "FACTORY", lines: [{ variantId, quantity: 1 }] },
  });
  expect(guestRes.status()).toBe(401);
  await context.close();
});

const SCREENSHOT_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1514, height: 681 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

test("screenshots: list, finance, settings at the four viewports", async ({ page }) => {
  await loginAsAdmin(page);
  for (const { width, height } of SCREENSHOT_VIEWPORTS) {
    await page.setViewportSize({ width, height });

    await page.goto("/admin/partners");
    await expect(page.getByRole("heading", { name: "الشركاء", exact: true })).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/admin-v2-partners-list-${width}x${height}.png`, fullPage: true });

    await page.goto(`/admin/partners/${pair.agent.partnerId}?tab=finance`);
    await expect(page.getByText("استلم بسعر التكلفة")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/admin-v2-partners-finance-${width}x${height}.png`, fullPage: true });

    await page.goto(`/admin/partners/${pair.agent.partnerId}?tab=settings`);
    await expect(page.getByText("المهل").first()).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/admin-v2-partners-settings-${width}x${height}.png`, fullPage: true });

    if (width === 390) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
      expect(overflow).toBe(true);
    }
  }
});
