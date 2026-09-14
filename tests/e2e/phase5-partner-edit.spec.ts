import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

/**
 * Backlog 8.2 — admin partner edit + deactivate. Coverage:
 *  - editing name + governorate (+ linked agent, distributor only) from the admin profile's
 *    الملف tab updates both the form and the list row, via the existing
 *    `PATCH /api/admin/partners/[id]` (no API change);
 *  - the deactivate confirm flow flips the badge to "غير نشط" and sends `isActive` alone;
 *  - what an inactive partner experiences today (unchanged, asserted not built): per
 *    `lib/auth/session.ts` `requirePartner()` (only `isActive: true` partners resolve) and
 *    `app/(partner)/partner/layout.tsx` (`requirePartner()` failing redirects to `/`), a
 *    deactivated partner who is still logged in and visits `/partner` is redirected to `/`.
 *
 * Re-pointed by backlog 9.4a: the admin partners list's per-type tabs and read-only detail
 * dialog are gone (`/admin/partners` is now the الشركاء hub list; `PartnerEditForm` moved,
 * unchanged, into `/admin/partners/[id]`'s الملف tab — a plain card on the page, not inside
 * a Radix `Dialog`). Every `dialog.getByRole(...)` call below became a `page.getByRole(...)`
 * call against the profile page, and every "open the detail dialog" helper now just
 * `page.goto`s the profile route directly (partner ids come from `pair`, not a table lookup).
 *
 * Rows/fixtures are looked up by phone (unique per seed run) rather than by name, since
 * `seedPartnerPair()` always uses the same display names ("وكيل الاختبار"/"موزع الاختبار")
 * and this spec runs `mode: "serial"`, so an earlier test's rename must not break a later
 * test's row lookup.
 */

const prisma = new PrismaClient();

const ADMIN_PHONE_LOCAL = "1099955501";
const ADMIN_PHONE = `+20${ADMIN_PHONE_LOCAL}`;
const ADMIN_PASSWORD = "PartnerEditAdmin123!";

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

test.describe.configure({ mode: "serial" });

let adminUserId: string;
let pair: PartnerFixturePair;

test.beforeAll(async () => {
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: "مسؤول اختبار تعديل الشركاء" },
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
  });
  adminUserId = admin.id;

  pair = await seedPartnerPair(prisma);
});

test.afterAll(async () => {
  await cleanupPartnerPair(prisma, pair);
  await prisma.user.deleteMany({ where: { id: adminUserId } });
  await prisma.$disconnect();
});

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE_LOCAL);
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 15000 });
}

async function openDistributorProfile(page: import("@playwright/test").Page) {
  await loginAsAdmin(page);
  await page.goto(`/admin/partners/${pair.distributor.partnerId}`);
  await expect(page.getByRole("button", { name: "تعديل" })).toBeVisible({ timeout: 20000 });
  return page;
}

test("editing a distributor's name and governorate updates the form and the list row", async ({ page }) => {
  await openDistributorProfile(page);
  await expect(page.getByText(pair.distributor.name).first()).toBeVisible();

  await page.getByRole("button", { name: "تعديل" }).click();

  const newName = `موزع معدل ${pair.distributor.localPhone.slice(-4)}`;
  await page.getByLabel("الاسم *").fill(newName);
  await page.getByLabel("المحافظة *").selectOption("الإسكندرية");
  await page.locator("form").getByRole("button", { name: "حفظ" }).click();

  // Form reverts to read mode with the new values.
  await expect(page.getByText(newName).first()).toBeVisible();
  await expect(page.getByText("الإسكندرية").first()).toBeVisible();

  // The list row reflects it too (searched by the new name — the list shows name/type/
  // governorate, not phone).
  await page.goto("/admin/partners");
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/admin/partners?") && r.url().includes("q="), { timeout: 20_000 }),
    page.getByPlaceholder("الاسم أو الهاتف").fill(newName),
  ]);
  const row = page.getByRole("row").filter({ hasText: newName });
  await expect(row).toBeVisible({ timeout: 20000 });
  await expect(row).toContainText("الإسكندرية");
});

test("cancel discards edits without saving", async ({ page }) => {
  await openDistributorProfile(page);

  await page.getByRole("button", { name: "تعديل" }).click();
  await page.getByLabel("الاسم *").fill("اسم لن يُحفظ");
  await page.getByRole("button", { name: "إلغاء" }).click();

  await expect(page.getByText("اسم لن يُحفظ")).toHaveCount(0);
  // Back to read mode.
  await expect(page.getByRole("button", { name: "تعديل" })).toBeVisible();
});

test("deactivating a distributor flips the badge to غير نشط, and the partner is redirected off /partner", async ({ page, browser }) => {
  await openDistributorProfile(page);

  await expect(page.locator("p", { hasText: "الحالة:" })).toHaveText("الحالة: نشط", { timeout: 10000 });
  await page.getByRole("button", { name: "تعطيل الحساب" }).click();

  const confirmDialog = page.getByRole("dialog").filter({ hasText: "تعطيل الحساب" }).last();
  await confirmDialog.getByRole("button", { name: "تأكيد" }).click();

  await expect(page.locator("p", { hasText: "الحالة:" })).toHaveText("الحالة: غير نشط");

  // Business requirement: an inactive partner is refused the portal exactly as today
  // (lib/auth/session.ts requirePartner() only resolves isActive:true partners; the
  // (partner) layout's catch redirects to "/") — asserted here, not changed.
  const partnerContext = await browser.newContext();
  const partnerPage = await partnerContext.newPage();
  await partnerPage.goto("/login");
  await partnerPage.getByLabel("رقم الهاتف").fill(pair.distributor.localPhone);
  await partnerPage.getByLabel("كلمة المرور").fill(pair.password);
  await partnerPage.getByRole("button", { name: "تسجيل الدخول" }).click();
  // login redirects an inactive partner to "/", not "/partner" (same requirePartner catch).
  await expect(partnerPage).toHaveURL("/", { timeout: 15000 });

  await partnerPage.goto("/partner");
  await expect(partnerPage).toHaveURL("/", { timeout: 15000 });
  await partnerContext.close();

  // Reactivate so cleanup's ordinary deletes are not affected by any inactive-only guard.
  await page.getByRole("button", { name: "تفعيل الحساب" }).click();
  const confirmDialog2 = page.getByRole("dialog").filter({ hasText: "تفعيل الحساب" }).last();
  await confirmDialog2.getByRole("button", { name: "تأكيد" }).click();
  await expect(page.locator("p", { hasText: "الحالة:" })).toHaveText("الحالة: نشط", { timeout: 10000 });
});

test("editing an agent's name updates the profile form and the list row", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto(`/admin/partners/${pair.agent.partnerId}`);
  await expect(page.getByRole("button", { name: "تعديل" })).toBeVisible({ timeout: 20000 });

  await page.getByRole("button", { name: "تعديل" }).click();
  const newName = `وكيل معدل ${pair.agent.localPhone.slice(-4)}`;
  await page.getByLabel("الاسم *").fill(newName);
  await page.locator("form").getByRole("button", { name: "حفظ" }).click();

  await expect(page.getByText(newName).first()).toBeVisible();

  await page.goto("/admin/partners");
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/admin/partners?") && r.url().includes("q="), { timeout: 20_000 }),
    page.getByPlaceholder("الاسم أو الهاتف").fill(newName),
  ]);
  await expect(page.getByRole("row").filter({ hasText: newName })).toBeVisible({ timeout: 20000 });
});

test("an invalid phone shows its error inline in the form, not just a toast", async ({ page }) => {
  await openDistributorProfile(page);

  await page.getByRole("button", { name: "تعديل" }).click();
  await page.getByLabel("رقم التليفون *").fill("123");
  await page.locator("form").getByRole("button", { name: "حفظ" }).click();

  await expect(page.getByText(/رقم الجوال يجب أن يكون رقم مصري صحيح/)).toBeVisible();
});

// 8.2 verifier fixes: focus goes into the form on تعديل and back to the trigger on إلغاء; the two
// selects use the shared Select (gold ring). Also captures the form at the two widths the
// verifier could not screenshot (1024×768, 390×844).
for (const vp of [{ width: 1024, height: 768 }, { width: 390, height: 844 }]) {
  test(`focus moves into the form on edit and back on cancel at ${vp.width}x${vp.height}`, async ({ page }) => {
    // openDistributorProfile logs in itself; resize after it so the login helper runs at the default viewport.
    await openDistributorProfile(page);
    await page.setViewportSize(vp);
    await page.screenshot({ path: `screenshots/8.2-read-${vp.width}x${vp.height}.png` });
    await page.getByRole("button", { name: "تعديل" }).click();
    await expect(page.getByLabel("الاسم *")).toBeFocused();
    await page.screenshot({ path: `screenshots/8.2-edit-${vp.width}x${vp.height}.png` });
    await page.getByLabel("المحافظة *").focus();
    await expect(page.getByLabel("المحافظة *")).toHaveCSS("box-shadow", /rgb/);
    await page.getByRole("button", { name: "إلغاء" }).click();
    await expect(page.getByRole("button", { name: "تعديل" })).toBeFocused();
    const toggleButton = page.getByRole("button", { name: "تعطيل الحساب" });
    await expect(toggleButton).toBeVisible({ timeout: 15000 });
    await toggleButton.click();
    await expect(page.getByRole("dialog").filter({ hasText: "تأكيد" }).last()).toBeVisible();
    await page.screenshot({ path: `screenshots/8.2-confirm-${vp.width}x${vp.height}.png` });
    await page.keyboard.press("Escape");
  });
}
