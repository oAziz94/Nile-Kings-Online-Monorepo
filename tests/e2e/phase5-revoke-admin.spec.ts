import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

/**
 * Backlog 8.3 (revoke admin access) coverage. Two seeded ADMIN fixtures, unique per run,
 * so the "last admin" guard can be exercised without touching any real admin row: after
 * demoting the second admin we are left with exactly one seeded admin (the caller), and
 * demoting *that one* (the only ADMIN left among our fixtures... but not necessarily the
 * only ADMIN in the whole table) would hit the real guard against the true admin count.
 * To test the LAST_ADMIN branch honestly without depending on the current state of
 * production-adjacent seed data, this spec proves the guard's *decision logic* end-to-end
 * by temporarily demoting every other real ADMIN row's role is never touched — instead the
 * last-admin scenario is covered at the unit level (lib/admin/revoke-admin.test.ts) against
 * the pure decision function, and here only via the two owned fixtures: self-demote (400),
 * demote-other (200), signed-out (401), customer (403). This matches the task's own
 * instruction that the last-admin *reason* is proven by the pure helper's Vitest coverage,
 * while the e2e sticks to self-demote/demote-other/401/403 on fixtures we own.
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

const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ADMIN_A_PHONE = "+201099944773";
const ADMIN_A_PASSWORD = "RevokeAdminA123!";
const ADMIN_B_PHONE = "+201099944774";
const ADMIN_B_PASSWORD = "RevokeAdminB123!";
const CUSTOMER_PHONE = "+201099944775";
const CUSTOMER_PASSWORD = "RevokeAdminCust123!";

test.describe.configure({ mode: "serial" });

let adminAId: string;
let adminBId: string;
let customerId: string;

async function loginAsAdminA(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_A_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_A_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 15000 });
}

test.beforeAll(async () => {
  const adminA = await prisma.user.upsert({
    where: { phone: ADMIN_A_PHONE },
    create: {
      phone: ADMIN_A_PHONE,
      role: "ADMIN",
      passwordHash: await hashPassword(ADMIN_A_PASSWORD),
      name: `مسؤول أ ${uniqueSuffix}`,
    },
    update: { passwordHash: await hashPassword(ADMIN_A_PASSWORD), role: "ADMIN" },
  });
  adminAId = adminA.id;

  const adminB = await prisma.user.upsert({
    where: { phone: ADMIN_B_PHONE },
    create: {
      phone: ADMIN_B_PHONE,
      role: "ADMIN",
      passwordHash: await hashPassword(ADMIN_B_PASSWORD),
      name: `مسؤول ب ${uniqueSuffix}`,
    },
    update: { passwordHash: await hashPassword(ADMIN_B_PASSWORD), role: "ADMIN" },
  });
  adminBId = adminB.id;

  const customer = await prisma.user.upsert({
    where: { phone: CUSTOMER_PHONE },
    create: {
      phone: CUSTOMER_PHONE,
      role: "CUSTOMER",
      passwordHash: await hashPassword(CUSTOMER_PASSWORD),
      name: `عميل اختبار ${uniqueSuffix}`,
    },
    update: { passwordHash: await hashPassword(CUSTOMER_PASSWORD), role: "CUSTOMER" },
  });
  customerId = customer.id;
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [adminAId, adminBId, customerId] } } });
  await prisma.$disconnect();
});

test("self-demote is refused with 400", async ({ page }) => {
  await loginAsAdminA(page);
  const res = await page.request.post(`/api/admin/clients/${adminAId}/revoke-admin`);
  expect(res.status()).toBe(400);
  const json = await res.json();
  expect(json.error.message).toBe("لا يمكنك إزالة صلاحياتك");
});

test("the admins page disables the caller's own revoke button with a tooltip", async ({ page }) => {
  await loginAsAdminA(page);
  await page.goto("/admin/admins");
  const rowA = page.getByRole("row").filter({ hasText: ADMIN_A_PHONE });
  await expect(rowA).toBeVisible();
  const revokeButtonA = rowA.getByRole("button", { name: "إزالة الصلاحية" });
  await expect(revokeButtonA).toBeDisabled();
});

test("demoting another admin returns 200, the row leaves the list, and /api/auth/me reflects CUSTOMER for them", async ({ page, browser }) => {
  await loginAsAdminA(page);
  await page.goto("/admin/admins");

  const rowB = page.getByRole("row").filter({ hasText: ADMIN_B_PHONE });
  await expect(rowB).toBeVisible();
  await rowB.getByRole("button", { name: "إزالة الصلاحية" }).click();

  await expect(page.getByRole("dialog").getByRole("heading", { name: "إزالة صلاحية المسؤول" })).toBeVisible();
  await page.getByRole("button", { name: "تأكيد الإزالة" }).click();

  await expect(page.getByText("تمت إزالة صلاحية المسؤول").first()).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: ADMIN_B_PHONE })).toHaveCount(0);

  const context = await browser.newContext();
  const bPage = await context.newPage();
  await bPage.goto("/login");
  await bPage.getByLabel("رقم الهاتف").fill(ADMIN_B_PHONE.replace("+20", ""));
  await bPage.getByLabel("كلمة المرور").fill(ADMIN_B_PASSWORD);
  await bPage.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(bPage).toHaveURL("/", { timeout: 15000 });

  const meRes = await bPage.request.get("/api/auth/me");
  expect(meRes.ok()).toBeTruthy();
  const meJson = await meRes.json();
  expect(meJson.data.role).toBe("CUSTOMER");
  await context.close();
});

test("a signed-out request gets 401", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const res = await page.request.post(`/api/admin/clients/${adminAId}/revoke-admin`);
  expect(res.status()).toBe(401);
  await context.close();
});

test("a customer session gets 403", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(CUSTOMER_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(CUSTOMER_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 15000 });

  const res = await page.request.post(`/api/admin/clients/${adminAId}/revoke-admin`);
  expect(res.status()).toBe(403);
});
