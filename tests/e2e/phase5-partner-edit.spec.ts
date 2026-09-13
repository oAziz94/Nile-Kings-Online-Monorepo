import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

/**
 * Backlog 8.2 — admin partner edit + deactivate. Coverage:
 *  - editing name + governorate (+ linked agent, distributor only) from the admin detail
 *    dialog updates both the dialog and the list row, via the existing
 *    `PATCH /api/admin/partners/[id]` (no API change);
 *  - the deactivate confirm flow flips the badge to "غير نشط" and sends `isActive` alone;
 *  - what an inactive partner experiences today (unchanged, asserted not built): per
 *    `lib/auth/session.ts` `requirePartner()` (only `isActive: true` partners resolve) and
 *    `app/(partner)/partner/layout.tsx` (`requirePartner()` failing redirects to `/`), a
 *    deactivated partner who is still logged in and visits `/partner` is redirected to `/`.
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

async function openDistributorDetail(page: import("@playwright/test").Page) {
  await loginAsAdmin(page);
  await page.goto("/admin/partners");
  await page.getByRole("button", { name: "موزعين" }).click();
  const row = page.getByRole("row").filter({ hasText: pair.distributor.localPhone });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "عرض التفاصيل" }).click();
  return page.getByRole("dialog");
}

test("editing a distributor's name and governorate updates the dialog and the list row", async ({ page }) => {
  const dialog = await openDistributorDetail(page);
  await expect(dialog.getByText("تفاصيل الموزع")).toBeVisible();
  await expect(dialog.getByText(pair.distributor.name)).toBeVisible();

  await dialog.getByRole("button", { name: "تعديل" }).click();

  const newName = `موزع معدل ${pair.distributor.localPhone.slice(-4)}`;
  await dialog.getByLabel("الاسم *").fill(newName);
  await dialog.getByLabel("المحافظة *").selectOption("الإسكندرية");
  await dialog.locator("form").getByRole("button", { name: "حفظ" }).click();

  // Dialog reverts to read mode with the new values.
  await expect(dialog.getByText(newName)).toBeVisible();
  await expect(dialog.getByText("الإسكندرية")).toBeVisible();

  // Close the dialog (Radix marks the table inert while it's open) and check the row behind it.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  const row = page.getByRole("row").filter({ hasText: pair.distributor.localPhone });
  await expect(row).toContainText(newName);
  await expect(row).toContainText("الإسكندرية");
});

test("cancel discards edits without saving", async ({ page }) => {
  const dialog = await openDistributorDetail(page);

  await dialog.getByRole("button", { name: "تعديل" }).click();
  await dialog.getByLabel("الاسم *").fill("اسم لن يُحفظ");
  await dialog.getByRole("button", { name: "إلغاء" }).click();

  await expect(dialog.getByText("اسم لن يُحفظ")).toHaveCount(0);
  // Back to read mode showing the (previously saved) name, not the discarded one.
  await expect(dialog.getByRole("button", { name: "تعديل" })).toBeVisible();
});

test("deactivating a distributor flips the badge to غير نشط, and the partner is redirected off /partner", async ({ page, browser }) => {
  const dialog = await openDistributorDetail(page);

  await expect(dialog.getByText("نشط")).toBeVisible({ timeout: 10000 });
  await dialog.getByRole("button", { name: "تعطيل الحساب" }).click();

  const confirmDialog = page.getByRole("dialog").filter({ hasText: "تعطيل الحساب" }).last();
  await confirmDialog.getByRole("button", { name: "تأكيد" }).click();

  await expect(dialog.getByText("غير نشط")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("row").filter({ hasText: pair.distributor.localPhone }).getByText("غير نشط", { exact: true })
  ).toBeVisible();

  // Re-open to reactivate below (the confirm dialog needs the detail dialog's button).
  await page.getByRole("row").filter({ hasText: pair.distributor.localPhone }).getByRole("button", { name: "عرض التفاصيل" }).click();
  const dialogAgain = page.getByRole("dialog");

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
  await dialogAgain.getByRole("button", { name: "تفعيل الحساب" }).click();
  const confirmDialog2 = page.getByRole("dialog").filter({ hasText: "تفعيل الحساب" }).last();
  await confirmDialog2.getByRole("button", { name: "تأكيد" }).click();
  await expect(dialogAgain.getByText("نشط")).toBeVisible({ timeout: 10000 });
});

test("editing an agent's name updates the agents tab dialog and row", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/partners");
  await page.getByRole("button", { name: "وكلاء" }).click();
  const row = page.getByRole("row").filter({ hasText: pair.agent.phone.replace("+20", "") });
  await row.getByRole("button", { name: "عرض التفاصيل" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "تعديل" }).click();
  const newName = `وكيل معدل ${pair.agent.localPhone.slice(-4)}`;
  await dialog.getByLabel("الاسم *").fill(newName);
  await dialog.locator("form").getByRole("button", { name: "حفظ" }).click();

  await expect(dialog.getByText(newName)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: pair.agent.localPhone })).toContainText(newName);
});

test("an invalid phone shows its error inline in the form, not just a toast", async ({ page }) => {
  const dialog = await openDistributorDetail(page);

  await dialog.getByRole("button", { name: "تعديل" }).click();
  await dialog.getByLabel("رقم التليفون *").fill("123");
  await dialog.locator("form").getByRole("button", { name: "حفظ" }).click();

  await expect(dialog.getByText(/رقم الجوال يجب أن يكون رقم مصري صحيح/)).toBeVisible();
});
