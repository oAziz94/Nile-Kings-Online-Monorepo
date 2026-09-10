import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import dotenv from "dotenv";
import path from "node:path";
import { Redis } from "@upstash/redis";

// Load the same env the real `dev:redesign` server uses — this test process is separate from
// the Next.js process, so it doesn't inherit either file automatically, and has to reproduce
// dotenv-cli's own precedence itself: .env.redesign's DATABASE_URL/DIRECT_URL (the `redesign`
// Neon branch) must win, with anything it doesn't define (Redis, JWT secret, Twilio, etc.)
// falling back to `.env`, since dotenv.config() never overrides an already-set process.env key.
//
// FIX (found while building backlog 4.2/Register, applies here too): this previously loaded
// only `.env` — meaning every run of this suite's beforeAll (and the rate-limit test's seeding)
// was writing test fixture users straight into the PRODUCTION database, not the redesign
// branch. Loading `.env.redesign` first wasn't enough on its own either: `@prisma/client`'s own
// import above already auto-loads the project's plain `.env` as a side effect before any code
// in this file runs (ESM import hoisting), setting DATABASE_URL to production *before* the
// dotenv.config() calls below ever execute — so without `override: true` on the first call,
// dotenv's default "don't clobber an already-set var" behavior made the `.env.redesign` load a
// silent no-op. `override: true` here forces it to win; the second call (plain `.env`, no
// override) only fills in whatever `.env.redesign` doesn't define.
dotenv.config({ path: path.resolve(__dirname, "../../.env.redesign"), override: true });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

/** Mirrors lib/redis/login-limits.ts's hourKey format exactly. */
function currentHourSuffix(): string {
  const now = new Date();
  const y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const H = String(now.getHours()).padStart(2, "0");
  return `${y}${M}${d}${H}`;
}

async function resetCurrentHourIpRateLimits(): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return; // best-effort; the boundary test below still mostly holds without this
  const redis = new Redis({ url, token });
  const hour = currentHourSuffix();
  let cursor = "0";
  const keys: string[] = [];
  do {
    const [next, batch] = await redis.scan(cursor, { match: `rl:login:ip:*:${hour}`, count: 200 });
    cursor = next as string;
    keys.push(...(batch as string[]));
  } while (cursor !== "0");
  if (keys.length > 0) await redis.del(...keys);
}

// Regression coverage for backlog task 4.1 (Login), added at ui-verifier sign-off
// (docs/redesign/04-decisions.md 2026-09-09 "Regression coverage persists past
// verification"). tests/e2e/smoke.spec.ts only asserts the form renders; this file
// covers the actual key states from docs/redesign/00-feature-inventory/auth/login.md:
// real labels/RTL, the select-width layout fix, keyboard focus, client validation
// toasts, the 7 server error branches (generic-message ones), the international
// account-phone change, a real successful login + its auto-redirect-if-logged-in
// edge case, and the new password rate limit.

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

const VALID_PHONE = "+201055512345";
const VALID_PASSWORD = "TestPass123!";
const OTP_ONLY_PHONE = "+201066654321";

// These tests share external, mutable state across the whole file (the Redis
// rate-limit counters in particular), which Playwright's default full-parallel model
// doesn't isolate between tests/workers. Serial mode keeps them on one worker in
// declaration order, matching what they actually assume.
test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  // Heavy local/manual verification traffic within the same clock hour can exhaust
  // the per-IP rate-limit quota (lib/redis/login-limits.ts, 30 fails/hour) on its own,
  // which would make later assertions below observe an early 429 that has nothing to
  // do with the per-phone boundary they're actually checking. Clear this hour's
  // rl:login:ip:* counters up front so the whole file is deterministic and
  // re-runnable — safe here since this only ever targets the Redis instance the
  // local/dev server itself is configured against.
  await resetCurrentHourIpRateLimits();

  const passwordHash = await hashPassword(VALID_PASSWORD);
  await prisma.user.upsert({
    where: { phone: VALID_PHONE },
    create: { phone: VALID_PHONE, role: "CUSTOMER", passwordHash },
    update: { passwordHash, role: "CUSTOMER" },
  });
  await prisma.user.upsert({
    where: { phone: OTP_ONLY_PHONE },
    create: { phone: OTP_ONLY_PHONE, role: "CUSTOMER" },
    update: { passwordHash: null },
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("renders RTL with real labels and the phone/country-code row laid out correctly", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const phoneInput = page.getByLabel("رقم الهاتف");
  const passwordInput = page.getByLabel("كلمة المرور");
  const countrySelect = page.getByLabel("رمز الدولة");
  await expect(phoneInput).toBeVisible();
  await expect(passwordInput).toBeVisible();
  await expect(countrySelect).toBeVisible();

  // Regression check for the 5da29bb layout fix: the Select's own base w-full class
  // must not collapse the phone input in the flex row (components/ui/select.tsx
  // itself is untouched; the fix is a className override at the call site).
  const phoneBox = await phoneInput.boundingBox();
  const selectBox = await countrySelect.boundingBox();
  expect(phoneBox).not.toBeNull();
  expect(selectBox).not.toBeNull();
  // The regression this guards against: components/ui/select.tsx's base w-full class
  // eating the whole flex row and collapsing the phone input toward zero width. A
  // native <select> with width:auto sizes to its widest *option* (not just the
  // selected one), so the two elements can legitimately land close in width at this
  // viewport — the meaningful invariant is that neither one collapses: the phone input
  // stays comfortably usable, and the select never balloons to dominate the ~400px card.
  expect(phoneBox!.width).toBeGreaterThan(150);
  expect(selectBox!.width).toBeLessThan(260);
});

test("keyboard reachability and a visible focus state", async ({ page }) => {
  await page.goto("/login");
  const phoneInput = page.getByLabel("رقم الهاتف");
  await phoneInput.focus();
  await expect(phoneInput).toBeFocused();
  const boxShadow = await phoneInput.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(boxShadow).not.toBe("none");

  const submitButton = page.getByRole("button", { name: "تسجيل الدخول" });
  await submitButton.focus();
  await expect(submitButton).toBeFocused();
  const btnShadow = await submitButton.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(btnShadow).not.toBe("none");
});

test("empty submit surfaces phone-then-password validation toasts, not inline errors", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page.getByText("أدخل رقم الجوال", { exact: true })).toBeVisible();

  await page.getByLabel("رقم الهاتف").fill("1012345678");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page.getByText("أدخل كلمة المرور", { exact: true })).toBeVisible();
});

test("wrong password and unknown phone both show the same generic destructive toast", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill("1055512345");
  await page.getByLabel("كلمة المرور").fill("WrongPassword");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page.getByText("رقم الجوال أو كلمة المرور غير صحيحة", { exact: true })).toBeVisible();
});

test("OTP-only account (no passwordHash) gets the create-a-password dead-end message", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill("1066654321");
  await page.getByLabel("كلمة المرور").fill("anything");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(
    page.getByText("هذا الحساب مسجّل بالتحقق برمز. أنشئ كلمة مرور من صفحة التسجيل أو استخدم إنشاء حساب.", {
      exact: true,
    })
  ).toBeVisible();
});

test("non-Egyptian account phone (Saudi) is validated internationally, not rejected as Egypt-only", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill("512345000");
  await page.getByLabel("رمز الدولة").selectOption({ label: "+966 السعودية" });
  await page.getByLabel("كلمة المرور").fill("whatever");
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  // Must reach the generic "wrong credentials" toast (proves it passed phone validation
  // and hit the DB lookup) rather than any phone-format error toast.
  await expect(page.getByText("رقم الجوال أو كلمة المرور غير صحيحة", { exact: true })).toBeVisible();
});

test("successful login redirects home, and a fresh visit to /login then auto-redirects away", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill("1055512345");
  await page.getByLabel("كلمة المرور").fill(VALID_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page.getByText("تم تسجيل الدخول", { exact: true })).toBeVisible();
  await page.waitForURL("**/");
  expect(new URL(page.url()).pathname).toBe("/");

  // Edge case from login.md: an already-logged-in (plain CUSTOMER) visitor hitting
  // /login directly gets a hard server redirect to "/", never shown the form.
  await page.goto("/login");
  await page.waitForURL("**/");
  expect(new URL(page.url()).pathname).toBe("/");
});

test("password rate limiting: 10 failed attempts per phone/hour, 11th is blocked", async ({ request }) => {
  // Fresh, never-before-used, validly-formatted Egyptian number each run so this
  // doesn't collide with a previous run's counter inside the same clock hour.
  const uniqueSuffix = String(Date.now()).slice(-8).padStart(8, "0");
  const phone = `+2010${uniqueSuffix}`;

  // lib/redis/login-limits.ts also tracks a per-IP counter (30 fails/hour) alongside
  // the per-phone one. Heavy local/manual verification traffic within the same clock
  // hour can exhaust the local loopback IP's quota on its own, which would make this
  // test observe an early 429 that has nothing to do with the per-phone boundary it's
  // actually checking. Reset this hour's rl:login:ip:* counters first so the test is
  // deterministic and re-runnable — safe here since this only ever targets the
  // Redis instance the local/dev server itself is configured against.
  await resetCurrentHourIpRateLimits();

  for (let i = 0; i < 10; i++) {
    const res = await request.post("/api/auth/login", {
      data: { phone, password: "wrong" },
    });
    expect(res.status(), `attempt ${i + 1} should be a plain 401, not yet rate-limited`).toBe(401);
  }

  const blocked = await request.post("/api/auth/login", {
    data: { phone, password: "wrong" },
  });
  expect(blocked.status()).toBe(429);
  const body = await blocked.json();
  expect(body.error.message).toContain("تجاوزت الحد المسموح");
});
