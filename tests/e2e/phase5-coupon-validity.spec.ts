import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

/**
 * Backlog 8.1 (coupon validity window). Seeds a single ADMIN fixture (account-v2-admin-tickets
 * pattern) that logs in through the UI, then exercises the new "يبدأ في"/"ينتهي في" fields on
 * `app/(admin)/admin/coupons/page.tsx`: create with a window and round-trip it through edit,
 * clear the end date, and the "لم يبدأ"/"منتهٍ" status hints for coupons seeded directly via
 * Prisma (so the window falls in the future/past without depending on the clock at run time).
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

const ADMIN_PHONE = "+201099944781";
const ADMIN_PASSWORD = "CouponValidityAdmin123!";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

test.describe.configure({ mode: "serial" });

const CREATE_CODE = `VALWIN${uniqueSuffix}`;
const EXPIRED_CODE = `EXPIRED${uniqueSuffix}`;
const NOT_STARTED_CODE = `FUTURE${uniqueSuffix}`;

let adminUserId: string;
let createdCouponId: string;
let expiredCouponId: string;
let notStartedCouponId: string;

/** `<input type="datetime-local">` value for a given Date, in local time. */
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 15000 });
}

test.beforeAll(async () => {
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: {
      phone: ADMIN_PHONE,
      role: "ADMIN",
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      name: "مسؤول اختبار صلاحية الكوبون",
    },
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
  });
  adminUserId = admin.id;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfterTomorrow = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const expiredCoupon = await prisma.coupon.create({
    data: {
      code: EXPIRED_CODE,
      discountType: "PERCENT",
      discountValue: 10,
      validFrom: twoDaysAgo,
      validUntil: yesterday,
      active: true,
    },
  });
  expiredCouponId = expiredCoupon.id;

  const notStartedCoupon = await prisma.coupon.create({
    data: {
      code: NOT_STARTED_CODE,
      discountType: "PERCENT",
      discountValue: 10,
      validFrom: tomorrow,
      validUntil: dayAfterTomorrow,
      active: true,
    },
  });
  notStartedCouponId = notStartedCoupon.id;
});

test.afterAll(async () => {
  await prisma.couponUsage.deleteMany({
    where: { couponId: { in: [createdCouponId, expiredCouponId, notStartedCouponId].filter(Boolean) } },
  });
  await prisma.coupon.deleteMany({
    where: { id: { in: [createdCouponId, expiredCouponId, notStartedCouponId].filter(Boolean) } },
  });
  await prisma.user.deleteMany({ where: { id: adminUserId } });
  await prisma.$disconnect();
});

test("creating a coupon with a validity window round-trips both dates through edit", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/coupons");

  await page.getByRole("button", { name: "إضافة كوبون" }).click();
  await expect(page.getByRole("heading", { name: "كوبون جديد" })).toBeVisible();

  await page.getByPlaceholder("SUMMER20").fill(CREATE_CODE);

  const now = new Date();
  const from = new Date(now.getTime() + 60 * 60 * 1000); // +1h, well clear of "now" edge cases
  const until = new Date(now.getTime() + 3 * 60 * 60 * 1000); // +3h
  const fromValue = toLocalInputValue(from);
  const untilValue = toLocalInputValue(until);

  await page.getByLabel("يبدأ في").fill(fromValue);
  await page.getByLabel("ينتهي في").fill(untilValue);

  await page.getByRole("button", { name: "إنشاء" }).click();
  await expect(page.getByText("تم إنشاء الكوبون").first()).toBeVisible();

  const created = await prisma.coupon.findUnique({ where: { code: CREATE_CODE } });
  expect(created).not.toBeNull();
  createdCouponId = created!.id;

  // Round-trip: reload the page, reopen the edit dialog, and the two datetime-local
  // fields must show the same local values that were submitted (minute precision).
  await page.reload();
  const row = page.getByRole("row", { name: new RegExp(CREATE_CODE) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "تعديل" }).click();

  await expect(page.getByRole("heading", { name: "تعديل الكوبون" })).toBeVisible();
  await expect(page.getByLabel("يبدأ في")).toHaveValue(fromValue);
  await expect(page.getByLabel("ينتهي في")).toHaveValue(untilValue);

  // Clear the end date via the "مسح" button, save, and confirm the table now shows
  // "بلا نهاية" instead of an end date.
  await page.getByRole("button", { name: "مسح" }).click();
  await expect(page.getByLabel("ينتهي في")).toHaveValue("");
  await page.getByRole("button", { name: "حفظ" }).click();
  await expect(page.getByText("تم حفظ التعديلات").first()).toBeVisible();

  await expect(row.getByText("بلا نهاية")).toBeVisible();

  const afterClear = await prisma.coupon.findUnique({ where: { id: createdCouponId } });
  expect(afterClear?.validUntil).toBeNull();
});

test("an inline error blocks submitting an end date before the start date", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/coupons");

  await page.getByRole("button", { name: "إضافة كوبون" }).click();
  await page.getByPlaceholder("SUMMER20").fill(`BADWIN${uniqueSuffix}`);

  const now = new Date();
  const from = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const beforeFrom = new Date(now.getTime() + 60 * 60 * 1000);

  await page.getByLabel("يبدأ في").fill(toLocalInputValue(from));
  await page.getByLabel("ينتهي في").fill(toLocalInputValue(beforeFrom));

  await expect(page.getByRole("alert").filter({ hasText: "تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء" })).toBeVisible();

  await page.getByRole("button", { name: "إنشاء" }).click();
  // Blocked client-side: dialog stays open, no coupon created for this code.
  await expect(page.getByRole("heading", { name: "كوبون جديد" })).toBeVisible();
  const shouldNotExist = await prisma.coupon.findUnique({ where: { code: `BADWIN${uniqueSuffix}` } });
  expect(shouldNotExist).toBeNull();

  await page.getByRole("button", { name: "إلغاء" }).click();
});

test("expired and not-yet-started coupons show their status hint next to the active badge", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/coupons");
  await page.getByPlaceholder("بحث بكود الكوبون…").fill(EXPIRED_CODE);

  const expiredRow = page.getByRole("row", { name: new RegExp(EXPIRED_CODE) });
  await expect(expiredRow).toBeVisible();
  await expect(expiredRow.getByText("منتهٍ")).toBeVisible();
  await expect(expiredRow.getByText("نشط")).toBeVisible();

  await page.getByPlaceholder("بحث بكود الكوبون…").fill(NOT_STARTED_CODE);
  const futureRow = page.getByRole("row", { name: new RegExp(NOT_STARTED_CODE) });
  await expect(futureRow).toBeVisible();
  await expect(futureRow.getByText("لم يبدأ")).toBeVisible();
});
