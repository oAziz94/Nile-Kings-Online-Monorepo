import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

/**
 * Backlog 9.7 (a)/(b) coverage: the four الإعدادات groups, the price-affecting confirm
 * dialog, the "السابق …" audit-history line, network defaults flowing into a new partner
 * (and never an existing one), the profile settings tab's "الافتراضي" reading the stored
 * value, alert-prefs persistence, and 401/403.
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

const ADMIN_PHONE = "+201099966101";
const ADMIN_PASSWORD = "AdminSettingsTest123!";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.describe.configure({ mode: "serial" });

let adminUserId: string;
let fixturePartnerId: string;
const createdPartnerIds: string[] = [];

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
    create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: "مسؤول اختبار الإعدادات" },
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
  });
  adminUserId = admin.id;

  const fixturePartner = await prisma.partner.create({
    data: {
      partnerType: "AGENT",
      name: `شريك ثابت للإعدادات ${uniqueSuffix}`,
      governorate: "القاهرة",
      phone: `+2010${uniqueSuffix}`.slice(0, 13),
      isActive: true,
      confirmSlaHours: 24,
      shipSlaHours: 48,
      costRateBps: 7500,
    },
  });
  fixturePartnerId = fixturePartner.id;
});

test.afterAll(async () => {
  // Restore stored network defaults to the schema constants so this run never leaks into
  // another spec's assumptions about a fresh install's fallback.
  await prisma.siteSetting.deleteMany({ where: { key: { in: ["partnerDefaults", "adminAlertPrefs"] } } });
  await prisma.adminAuditLog.deleteMany({ where: { OR: [{ entityId: fixturePartnerId }, { entityId: { in: createdPartnerIds } }] } });
  await prisma.partner.deleteMany({ where: { id: { in: [fixturePartnerId, ...createdPartnerIds] } } });
  await prisma.user.deleteMany({ where: { id: adminUserId } });
  await prisma.$disconnect();
});

test("المتجر: COD fee change shows a confirm dialog, saves, and shows the previous-value line after", async ({ page }) => {
  await loginAsAdmin(page);

  // This setting is a single global row (not scoped to this test's fixtures), so re-running
  // this spec against a shared branch must always produce a REAL diff — read the current
  // value first and pick a genuinely different target, rather than a hardcoded "2.5" that a
  // previous run may have already left in place (which would make the save a no-op and skip
  // the audit row entirely, per `logAdminAction`'s own documented behaviour).
  const before = await (await page.request.get("/api/admin/settings/cod-fee")).json();
  const beforePercent = before.data.codFeePercent as number;
  const nextPercent = beforePercent === 2.5 ? 3.5 : 2.5;

  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible();

  const codInput = page.getByLabel("رسوم الدفع عند الاستلام");
  await codInput.fill(String(nextPercent));

  const storeCard = page.locator("text=المتجر").first().locator("xpath=ancestor::div[contains(@class,'shadow-soft')]").first();
  await storeCard.getByRole("button", { name: "حفظ" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("تأكيد تغيير يمس سعر العميل")).toBeVisible();
  await dialog.getByRole("button", { name: "تأكيد الحفظ" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await expect(page.getByLabel("رسوم الدفع عند الاستلام")).toHaveValue(String(nextPercent));
  await expect(page.getByText(/السابق .* · .* · أنت/)).toBeVisible({ timeout: 10_000 });
});

test("الشركاء · افتراضيات الشبكة: saving changes what a NEW partner inherits, never the existing fixture partner", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/settings");

  await page.getByLabel("نسبة الشراء").fill("70");
  const networkCard = page.locator("text=الشركاء · افتراضيات الشبكة").first().locator("xpath=ancestor::div[contains(@class,'shadow-soft')]").first();
  await networkCard.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("تم حفظ افتراضيات الشبكة").first()).toBeVisible({ timeout: 10_000 });

  const res = await page.request.get("/api/admin/settings/partner-defaults");
  const json = await res.json();
  expect(json.data.costRateBps).toBe(7000);

  const createRes = await page.request.post("/api/admin/partners", {
    data: {
      partnerType: "AGENT",
      name: `شريك جديد بعد التغيير ${uniqueSuffix}`,
      governorate: "الجيزة",
      phone: `+2011${uniqueSuffix}`.slice(0, 13),
    },
  });
  expect(createRes.ok()).toBeTruthy();
  const created = await createRes.json();
  createdPartnerIds.push(created.data.id);
  expect(created.data.costRateBps).toBe(7000);

  const fixtureStill = await prisma.partner.findUniqueOrThrow({ where: { id: fixturePartnerId } });
  expect(fixtureStill.costRateBps).toBe(7500); // untouched
});

test("profile settings tab's 'الافتراضي' reflects the stored network default", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/partners/${fixturePartnerId}?tab=settings`);
  await expect(page.getByText(/الافتراضي 70%/)).toBeVisible({ timeout: 15_000 });
});

test("الأمان: OTP rules save and reload", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/settings");
  await page.getByLabel("صلاحية الرمز").fill("7");
  const securityCard = page.locator("text=الأمان").first().locator("xpath=ancestor::div[contains(@class,'shadow-soft')]").first();
  await securityCard.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("تم حفظ قواعد الأمان").first()).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByLabel("صلاحية الرمز")).toHaveValue("7");
});

test("الإشعارات: alert-prefs toggle persists", async ({ page }) => {
  await loginAsAdmin(page);

  const before = await (await page.request.get("/api/admin/settings/alert-prefs")).json();
  const wasOn = Boolean(before.data.partnerOutOfStock);
  const expectAfterToggle = wasOn ? "false" : "true";

  await page.goto("/admin/settings");
  const toggle = page.getByText("صنف نافد عند شريك").locator("xpath=following-sibling::button[@role='switch']");
  await expect(toggle).toHaveAttribute("aria-checked", String(wasOn));
  await toggle.click();
  const notifCard = page.locator("text=الإشعارات").first().locator("xpath=ancestor::div[contains(@class,'shadow-soft')]").first();
  await notifCard.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("تم حفظ الإشعارات").first()).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await expect(page.getByText("صنف نافد عند شريك").locator("xpath=following-sibling::button[@role='switch']")).toHaveAttribute(
    "aria-checked",
    expectAfterToggle
  );
});

test("401/403: a signed-out request and a customer session are both rejected", async ({ page, browser }) => {
  const customerPhone = "+201099966102";
  await prisma.user.upsert({
    where: { phone: customerPhone },
    create: { phone: customerPhone, role: "CUSTOMER", passwordHash: await hashPassword("SettingsCust123!") },
    update: { passwordHash: await hashPassword("SettingsCust123!"), role: "CUSTOMER" },
  });

  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  const guestRes = await guestPage.request.get("/api/admin/settings/partner-defaults");
  expect(guestRes.status()).toBe(401);
  await guestContext.close();

  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(customerPhone.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill("SettingsCust123!");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  const custRes = await page.request.get("/api/admin/settings/partner-defaults");
  expect(custRes.status()).toBe(403);

  await prisma.user.deleteMany({ where: { phone: customerPhone } });
});

const SCREENSHOT_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1514, height: 681 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

test("screenshots: /admin/settings at the four viewports", async ({ page }) => {
  await loginAsAdmin(page);
  for (const { width, height } of SCREENSHOT_VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "الإعدادات" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("رسوم الدفع عند الاستلام")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByLabel("صلاحية الرمز")).toBeVisible({ timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/admin-v2-settings-${width}x${height}.png`, fullPage: true });
  }
});

test("390×844: settings groups stack into a single column", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  await page.goto("/admin/settings");
  const cards = page.locator("main .grid.gap-4 > div");
  await expect(cards.first()).toBeVisible();
  const gridBox = await page.locator("main .grid.gap-4").first().boundingBox();
  const firstBox = await cards.first().boundingBox();
  expect(firstBox && gridBox && firstBox.width).toBeGreaterThan(0);
  // single column: every card's width ~= the grid's width at this viewport
  if (gridBox && firstBox) {
    expect(Math.abs(firstBox.width - gridBox.width)).toBeLessThan(4);
  }
});
