import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { Redis } from "@upstash/redis";

// Regression coverage for backlog task 4.2 (Register), mirroring tests/e2e/auth-login.spec.ts's
// pattern exactly (real DB-seeded fixtures, RTL/label checks, serial mode for shared Redis
// counter state). Covers the key states from docs/redesign/00-feature-inventory/auth/
// register.md: the two-step phone->profile flow, both open-redirect-guard fixes (safeRedirect
// + the new already-logged-in guard), the international account-phone change, the
// already-registered/OTP-only dead-end message (documented, not fixed, per
// docs/redesign/03-backlog.md 4.2 "Explicitly NOT in scope"), the new terms/privacy link, the
// new registration rate limit, and the new shared two-pane desktop layout at both viewports.

const prisma = new PrismaClient();

let seq = 0;
/** Fresh 8-digit suffix per call, even across calls in the same millisecond. */
function uniqueSuffix(): string {
  seq += 1;
  return String(Date.now() + seq).slice(-8).padStart(8, "0");
}

/** Mirrors lib/redis/register-limits.ts's hourKey format exactly. */
function currentHourSuffix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const H = String(now.getHours()).padStart(2, "0");
  return `${y}${M}${d}${H}`;
}

async function resetCurrentHourRegisterIpRateLimits(): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return; // best-effort; the boundary test below still mostly holds without this
  const redis = new Redis({ url, token });
  const hour = currentHourSuffix();
  let cursor = "0";
  const keys: string[] = [];
  do {
    const [next, batch] = await redis.scan(cursor, { match: `rl:register:ip:*:${hour}`, count: 200 });
    cursor = next as string;
    keys.push(...(batch as string[]));
  } while (cursor !== "0");
  if (keys.length > 0) await redis.del(...keys);
}

const EXISTING_OTP_PHONE = "+201077765432"; // passwordless account, as if created by the removed OTP flow

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetCurrentHourRegisterIpRateLimits();
  await prisma.user.upsert({
    where: { phone: EXISTING_OTP_PHONE },
    create: { phone: EXISTING_OTP_PHONE, role: "CUSTOMER" },
    update: { passwordHash: null },
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("renders RTL with real labels, the phone/country-code row, and starts on the phone step", async ({ page }) => {
  await page.goto("/register");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const phoneInput = page.getByLabel("رقم الهاتف");
  const countrySelect = page.getByLabel("رمز الدولة");
  await expect(phoneInput).toBeVisible();
  await expect(countrySelect).toBeVisible();
  await expect(page.getByRole("button", { name: "متابعة" })).toBeVisible();

  // Profile-step fields are not yet in the DOM.
  await expect(page.getByLabel("الاسم الكامل")).toHaveCount(0);

  // Same select-collapse regression guard as login (components/ui/select.tsx's base
  // w-full class must not eat the flex row).
  const phoneBox = await phoneInput.boundingBox();
  const selectBox = await countrySelect.boundingBox();
  expect(phoneBox!.width).toBeGreaterThan(150);
  expect(selectBox!.width).toBeLessThan(260);
});

test("empty phone at the first step toasts and does not advance; a filled phone advances to the profile step", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByText("أدخل رقم الجوال", { exact: true })).toBeVisible();
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible();

  await page.getByLabel("رقم الهاتف").fill("1012345678");
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByLabel("الاسم الكامل")).toBeVisible();
  await expect(page.getByLabel("كلمة المرور", { exact: true })).toBeVisible();
  await expect(page.getByLabel("تأكيد كلمة المرور")).toBeVisible();
});

test('"تغيير الرقم" returns to the phone step without clearing the previously entered profile values', async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("رقم الهاتف").fill("1012345678");
  await page.getByRole("button", { name: "متابعة" }).click();
  await page.getByLabel("الاسم الكامل").fill("اسم محفوظ");

  await page.getByRole("button", { name: "تغيير الرقم" }).click();
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible();
  await expect(page.getByLabel("رقم الهاتف")).toHaveValue("1012345678");

  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByLabel("الاسم الكامل")).toHaveValue("اسم محفوظ");
});

test("profile-step client validation: name, then password length, then mismatch, each as its own toast (no network call)", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("رقم الهاتف").fill("1098765432");
  await page.getByRole("button", { name: "متابعة" }).click();

  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
  await page.getByLabel("تأكيد كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByText("الاسم مطلوب (حرفان على الأقل)", { exact: true })).toBeVisible();

  await page.getByLabel("الاسم الكامل").fill("Test");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("short");
  await page.getByLabel("تأكيد كلمة المرور").fill("short");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByText("كلمة المرور يجب أن تكون 8 أحرف على الأقل", { exact: true })).toBeVisible();

  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
  await page.getByLabel("تأكيد كلمة المرور").fill("Different123!");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByText("كلمتا المرور غير متطابقتين", { exact: true })).toBeVisible();
});

test("profile step shows a terms/privacy link near the submit button", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("رقم الهاتف").fill("1011111111");
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByRole("link", { name: "الشروط والأحكام" })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "سياسة الخصوصية" })).toHaveAttribute("href", "/privacy");
});

test("registering an already-registered phone (including an OTP-only dead account) shows the existing dead-end message, not a claim/recovery path", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("رقم الهاتف").fill("1077765432");
  await page.getByRole("button", { name: "متابعة" }).click();
  await page.getByLabel("الاسم الكامل").fill("مستخدم تجريبي");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
  await page.getByLabel("تأكيد كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(
    page.getByText("هذا الرقم مسجّل مسبقاً. استخدم تسجيل الدخول.", { exact: true })
  ).toBeVisible();
});

test("non-Egyptian account phone (Saudi) can register successfully, validated internationally not rejected as Egypt-only", async ({ page }) => {
  // Fixed "51" prefix (a real assigned Saudi mobile range), only the trailing 7 digits vary
  // per run for uniqueness — libphonenumber-js's mobile metadata rejects some "5X" second
  // digits (e.g. "52") as not a real assigned range, so a fully random suffix here would be
  // flaky against the *test's own* generated number, not against the app under test.
  const national = `51${uniqueSuffix().slice(1)}`;
  await page.goto("/register");
  await page.getByLabel("رقم الهاتف").fill(national);
  await page.getByLabel("رمز الدولة").selectOption({ label: "+966 السعودية" });
  await page.getByRole("button", { name: "متابعة" }).click();
  await page.getByLabel("الاسم الكامل").fill("عميل من السعودية");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
  await page.getByLabel("تأكيد كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByText("تم إنشاء الحساب", { exact: true })).toBeVisible();
});

test("successful registration redirects home, and a fresh visit to /register then auto-redirects away", async ({ page }) => {
  const national = `10${uniqueSuffix()}`;
  await page.goto("/register");
  await page.getByLabel("رقم الهاتف").fill(national);
  await page.getByRole("button", { name: "متابعة" }).click();
  await page.getByLabel("الاسم الكامل").fill("مستخدم جديد");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
  await page.getByLabel("تأكيد كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByText("تم إنشاء الحساب", { exact: true })).toBeVisible();
  await page.waitForURL("**/");
  expect(new URL(page.url()).pathname).toBe("/");

  // Edge case fixed by this task: /register previously had no guard at all, unlike /login.
  await page.goto("/register");
  await page.waitForURL("**/");
  expect(new URL(page.url()).pathname).toBe("/");
});

test("a safe explicit ?redirect= is honored after successful registration", async ({ page }) => {
  const national = `10${uniqueSuffix()}`;
  await page.goto("/register?redirect=%2Fcategories");
  await page.getByLabel("رقم الهاتف").fill(national);
  await page.getByRole("button", { name: "متابعة" }).click();
  await page.getByLabel("الاسم الكامل").fill("مستخدم جديد");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
  await page.getByLabel("تأكيد كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await page.waitForURL("**/categories");
  expect(new URL(page.url()).pathname).toBe("/categories");
});

test("an unsafe protocol-relative ?redirect= (//host) is rejected, falling back to home — the open-redirect fix", async ({ page }) => {
  const national = `10${uniqueSuffix()}`;
  await page.goto("/register?redirect=%2F%2Fevil.example");
  await page.getByLabel("رقم الهاتف").fill(national);
  await page.getByRole("button", { name: "متابعة" }).click();
  await page.getByLabel("الاسم الكامل").fill("مستخدم جديد");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
  await page.getByLabel("تأكيد كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByText("تم إنشاء الحساب", { exact: true })).toBeVisible();
  await page.waitForURL("**/");
  expect(new URL(page.url()).pathname).toBe("/");
  expect(page.url()).not.toContain("evil.example");
});

test("registration rate limiting: 10 failed attempts per phone/hour, 11th is blocked", async ({ request }) => {
  // A dedicated, never-before-used phone this run, pre-seeded as an existing account so every
  // attempt against it deterministically fails with "already registered" — the only
  // meaningful register failure worth rate-limiting (see lib/redis/register-limits.ts).
  const phone = `+2010${uniqueSuffix()}`;
  await resetCurrentHourRegisterIpRateLimits();
  await prisma.user.upsert({
    where: { phone },
    create: { phone, role: "CUSTOMER" },
    update: {},
  });

  for (let i = 0; i < 10; i++) {
    const res = await request.post("/api/auth/register", {
      data: { phone, name: "Test User", password: "TestPass123!" },
    });
    expect(res.status(), `attempt ${i + 1} should be a plain 400, not yet rate-limited`).toBe(400);
  }

  const blocked = await request.post("/api/auth/register", {
    data: { phone, name: "Test User", password: "TestPass123!" },
  });
  expect(blocked.status()).toBe(429);
  const body = await blocked.json();
  expect(body.error.message).toContain("تجاوزت الحد المسموح");
});

test("desktop viewport shows the shared two-pane brand layout alongside a fully usable form", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/register");
  await expect(page.getByText("قطن مصري", { exact: false })).toBeVisible();
  await expect(page.getByText("أكثر من 27 محافظة", { exact: false })).toBeVisible();
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible();
});

test("mobile viewport collapses to a single centered card with no brand pane, exactly as before this layout existed", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/register");
  await expect(page.getByText("قطن مصري", { exact: false })).toBeHidden();
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible();
  await expect(page.getByRole("button", { name: "متابعة" })).toBeVisible();
});
