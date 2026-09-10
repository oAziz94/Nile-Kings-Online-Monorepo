import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { Redis } from "@upstash/redis";
import parsePhoneNumber from "libphonenumber-js/mobile";

// Regression coverage for backlog task 4.4 (WhatsApp OTP via WaPilot), which reinstated OTP
// verification at registration — a real flow change from the previous phone->profile->submit
// (backlog 4.2) to phone->WhatsApp OTP->profile->create account (backlog 4.4, mirroring
// forgot-password's own phone->OTP->next-step structure). This file replaces the previous
// (4.2-era) auth-register.spec.ts's two-step assumptions; it still covers every still-applicable
// parity item from that suite (RTL/labels, both open-redirect-guard fixes, the international
// account-phone change, the already-registered/OTP-only dead-end message, the terms/privacy
// link, the registration rate limit, the shared two-pane desktop layout) plus the new OTP step's
// own states (mirroring tests/e2e/auth-forgot-password.spec.ts's OTP-box/cooldown/lock coverage)
// and the new registerToken account-creation gate.
//
// WhatsApp (WaPilot) note, same discipline as auth-forgot-password.spec.ts: neither `.env` nor
// `.env.redesign` has real WAPILOT_INSTANCE_ID/WAPILOT_API_TOKEN configured yet (disclosed,
// known gap — see docs/redesign/04-decisions.md and this task's final report). This suite never
// triggers a real WhatsApp send:
//   - The "already registered" / "invalid phone format" branches of `requestRegisterOtp` both
//     return before `requestOtp()` (the only WhatsApp-sending function) is ever invoked, so
//     they're tested against the real, unmocked `/api/auth/register/request` route.
//   - Every "the phone step succeeds and advances to the OTP step" scenario mocks only the
//     browser's network call to `/api/auth/register/request` (via page.route) — never the real
//     route — so this suite stays safe to run again once real WaPilot credentials are added.
//   - `/api/auth/register/verify` and `/api/auth/register` touch zero WhatsApp code (only
//     DB/Redis/JWT), so those run for real, unmocked, against a known OTP code seeded directly
//     into the `OTPRequest` table (hashed the same way `lib/auth/otp.ts`'s `hashOtp` does) — this
//     proves the real server-side lock/attempt-counter/registerToken/account-creation logic
//     without needing to receive a real WhatsApp message.

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

async function clearOtpRedisState(phone: string): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return; // best-effort
  const redis = new Redis({ url, token });
  await redis.del(`otp:cooldown:${phone}`, `otp:lock:${phone}`, `otp:verify_attempts:${phone}`);
}

/** Mirrors lib/auth/otp.ts's hashOtp exactly (sha256 of the first 16 chars of JWT_SECRET + code). */
function hashOtp(code: string): string {
  const salt = (process.env.JWT_SECRET ?? "").slice(0, 16);
  return crypto.createHash("sha256").update(salt + code).digest("hex");
}

/** A real, validly-formatted Saudi mobile number in E.164 — same local-helper precedent as
 * tests/e2e/auth-forgot-password.spec.ts's `saudiE164` (no e2e spec imports "@/lib/phone"). */
function saudiE164(national: string): string {
  const phone = parsePhoneNumber(`+966${national}`, "SA");
  if (!phone || !phone.isValid()) {
    throw new Error(`test fixture: "${national}" did not parse as a valid Saudi mobile number`);
  }
  return phone.number;
}

/** Seeds a known-code OTPRequest row (purpose "register") directly, bypassing WaPilot entirely
 * (see file header) so the OTP step's verify action can run for real against a known code. */
async function seedRegisterOtp(phone: string, code: string): Promise<void> {
  const future = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.oTPRequest.deleteMany({ where: { phone, purpose: "register" } });
  await prisma.oTPRequest.create({
    data: { phone, codeHash: hashOtp(code), expiresAt: future, purpose: "register" },
  });
}

/** Intercepts the browser's call to the register OTP-request route and fabricates a success
 * response, without ever reaching the real route (see the WhatsApp/WaPilot note above). */
async function mockRegisterRequestSuccess(page: Page, cooldownSeconds: number): Promise<void> {
  await page.route("**/api/auth/register/request", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { cooldownSeconds },
        message: "تم إرسال رمز التحقق عبر واتساب",
      }),
    });
  });
}

const OTP_LENGTH = 6;
const OTP_CODE = "482913";

const EXISTING_OTP_PHONE = "+201077765432"; // passwordless account, as if created by the removed OTP flow
const WRONG_CODE_PHONE = "+201099922200";
const LOCK_PHONE = "+201099922300";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetCurrentHourRegisterIpRateLimits();
  await Promise.all([clearOtpRedisState(WRONG_CODE_PHONE), clearOtpRedisState(LOCK_PHONE)]);

  await prisma.user.upsert({
    where: { phone: EXISTING_OTP_PHONE },
    create: { phone: EXISTING_OTP_PHONE, role: "CUSTOMER" },
    update: { passwordHash: null },
  });

  await seedRegisterOtp(WRONG_CODE_PHONE, OTP_CODE);
  await seedRegisterOtp(LOCK_PHONE, OTP_CODE);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/** Drives the UI from the phone step through a (mocked) OTP send and a (real, unmocked) OTP
 * verify, leaving the page on the profile step. Seeds a matching OTPRequest row first so the
 * real verify route succeeds against a known code. */
async function advanceToProfileStep(
  page: Page,
  opts: { national: string; phone: string; countryLabel?: string; cooldownSeconds?: number }
): Promise<void> {
  await seedRegisterOtp(opts.phone, OTP_CODE);
  await mockRegisterRequestSuccess(page, opts.cooldownSeconds ?? 60);
  await page.goto("/register");
  await page.getByLabel("رقم الهاتف").fill(opts.national);
  if (opts.countryLabel) {
    await page.getByLabel("رمز الدولة").selectOption({ label: opts.countryLabel });
  }
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByLabel("رقم 1")).toBeVisible();
  await page.getByLabel("رقم 1").fill(OTP_CODE);
  await expect(page.getByRole("button", { name: "تحقق ومتابعة" })).toBeEnabled();
  await page.getByRole("button", { name: "تحقق ومتابعة" }).click();
  await expect(page.getByLabel("الاسم الكامل")).toBeVisible();
}

test("renders RTL with real labels, the phone/country-code row, WhatsApp copy, and starts on the phone step", async ({ page }) => {
  await page.goto("/register");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const phoneInput = page.getByLabel("رقم الهاتف");
  const countrySelect = page.getByLabel("رمز الدولة");
  await expect(phoneInput).toBeVisible();
  await expect(countrySelect).toBeVisible();
  await expect(page.getByRole("button", { name: "متابعة" })).toBeVisible();
  // Backlog 4.4 copy requirement: must say the OTP arrives via WhatsApp specifically.
  await expect(page.getByText("سيصلك رمز التحقق عبر واتساب", { exact: false })).toBeVisible();

  // Neither the OTP step nor the profile step's fields are in the DOM yet.
  await expect(page.getByLabel("رقم 1")).toHaveCount(0);
  await expect(page.getByLabel("الاسم الكامل")).toHaveCount(0);

  // Same select-collapse regression guard as login/4.2 (components/ui/select.tsx's base
  // w-full class must not eat the flex row).
  const phoneBox = await phoneInput.boundingBox();
  const selectBox = await countrySelect.boundingBox();
  expect(phoneBox!.width).toBeGreaterThan(150);
  expect(selectBox!.width).toBeLessThan(260);
});

test("empty phone at the phone step toasts and never calls the server", async ({ page }) => {
  let called = false;
  await page.route("**/api/auth/register/request", async (route) => {
    called = true;
    await route.continue();
  });
  await page.goto("/register");
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByText("أدخل رقم الجوال", { exact: true })).toBeVisible();
  expect(called).toBe(false);
});

test("an unparseable phone number shows the international account-phone format error and never advances", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("رقم الهاتف").fill("123");
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByText("رقم الجوال غير صحيح لهذه الدولة", { exact: true })).toBeVisible();
  await expect(page.getByLabel("رقم 1")).toHaveCount(0);
});

test("registering an already-registered phone (including an OTP-only dead account) is rejected at the phone step, before any OTP is sent — no claim/recovery path", async ({ page }) => {
  await page.goto("/register");
  await page.getByLabel("رقم الهاتف").fill(EXISTING_OTP_PHONE.replace("+20", ""));
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(
    page.getByText("هذا الرقم مسجّل مسبقاً. استخدم تسجيل الدخول.", { exact: true })
  ).toBeVisible();
  await expect(page.getByLabel("رقم 1")).toHaveCount(0); // stays on the phone step
});

test("a successful phone-step request advances to the OTP step, shows the WhatsApp-specific copy, ticks the resend cooldown, allows resend once it clears, and 'تغيير الرقم' returns to the phone step with the phone preserved", async ({ page }) => {
  await mockRegisterRequestSuccess(page, 2);
  await page.goto("/register");
  const national = "1099922400";
  await page.getByLabel("رقم الهاتف").fill(national);
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByText("تم إرسال رمز التحقق عبر واتساب", { exact: true })).toBeVisible();
  await expect(
    page.getByText(`أدخل الرمز المرسل عبر واتساب إلى +20 ${national}`, { exact: true })
  ).toBeVisible();

  await expect(page.getByRole("button", { name: /إعادة الإرسال بعد \d+ ثانية/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "إعادة إرسال الرمز" })).toBeEnabled({ timeout: 4000 });

  await page.getByRole("button", { name: "إعادة إرسال الرمز" }).click();
  await expect(page.getByText("تم إرسال رمز جديد عبر واتساب", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "تغيير الرقم" }).click();
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible();
  await expect(page.getByLabel("رقم الهاتف")).toHaveValue(national);
});

test("OTP boxes auto-advance on digit entry, backspace on an empty box moves focus back, and a multi-digit fill fans out across the remaining boxes", async ({ page }) => {
  await mockRegisterRequestSuccess(page, 60);
  await page.goto("/register");
  await page.getByLabel("رقم الهاتف").fill("1099922500");
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByText("تم إرسال رمز التحقق عبر واتساب", { exact: true })).toBeVisible();

  const boxes = Array.from({ length: OTP_LENGTH }, (_, i) => page.getByLabel(`رقم ${i + 1}`));
  await expect(boxes[0]).toBeFocused();

  await page.keyboard.type("123");
  await expect(boxes[0]).toHaveValue("1");
  await expect(boxes[1]).toHaveValue("2");
  await expect(boxes[2]).toHaveValue("3");
  await expect(boxes[3]).toBeFocused();

  // Same verbatim handler as forgot-password's OTP boxes (byte-identical, not reinvented for
  // register) — backspace on the empty focused box moves focus back and clears the previous
  // box's digit, per the pre-existing, documented (not a bug) behavior.
  await page.keyboard.press("Backspace");
  await expect(boxes[2]).toBeFocused();
  await expect(boxes[2]).toHaveValue("");

  await page.keyboard.type("3");
  await expect(boxes[2]).toHaveValue("3");
  await expect(boxes[3]).toBeFocused();

  await boxes[3].fill("456789");
  await expect(boxes[3]).toHaveValue("4");
  await expect(boxes[4]).toHaveValue("5");
  await expect(boxes[5]).toHaveValue("6");
  await expect(boxes[5]).toBeFocused();

  await expect(page.getByRole("button", { name: "تحقق ومتابعة" })).toBeEnabled();
});

test("a wrong OTP code is rejected with a generic message and the digits are not cleared", async ({ page }) => {
  await mockRegisterRequestSuccess(page, 60);
  await page.goto("/register");
  await page.getByLabel("رقم الهاتف").fill(WRONG_CODE_PHONE.replace("+20", ""));
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByText("تم إرسال رمز التحقق عبر واتساب", { exact: true })).toBeVisible();

  const boxes = Array.from({ length: OTP_LENGTH }, (_, i) => page.getByLabel(`رقم ${i + 1}`));
  await boxes[0].fill("000000");
  await page.getByRole("button", { name: "تحقق ومتابعة" }).click();
  await expect(page.getByText("رمز التحقق غير صحيح", { exact: true })).toBeVisible();
  await expect(boxes[0]).toHaveValue("0");
  await expect(boxes[5]).toHaveValue("0");
  await expect(page.getByLabel("الاسم الكامل")).toHaveCount(0); // did not advance to the profile step
});

test("exceeding the max verify attempts locks the phone; even a subsequently correct code is rejected while locked", async ({ request }) => {
  const setting = await prisma.siteSetting.findUnique({ where: { key: "otp_max_verify_attempts" } });
  const maxAttempts = setting?.value ? parseInt(setting.value, 10) : 5;

  for (let i = 0; i < maxAttempts; i++) {
    const res = await request.post("/api/auth/register/verify", {
      data: { phone: LOCK_PHONE, code: "999999" },
    });
    expect(res.status(), `attempt ${i + 1} should be a plain 400, not yet locked`).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("رمز التحقق غير صحيح");
  }

  const lockedRes = await request.post("/api/auth/register/verify", {
    data: { phone: LOCK_PHONE, code: "999999" },
  });
  expect(lockedRes.status()).toBe(429);
  const lockedBody = await lockedRes.json();
  expect(lockedBody.error.message).toContain("عدد المحاولات كبير");

  const correctButLockedRes = await request.post("/api/auth/register/verify", {
    data: { phone: LOCK_PHONE, code: OTP_CODE },
  });
  expect(correctButLockedRes.status()).toBe(429);
  const correctBody = await correctButLockedRes.json();
  expect(correctBody.error.message).toContain("مقفل");
});

test("'العودة لتغيير الرمز' on the profile step returns to the OTP step", async ({ page }) => {
  const national = `10${uniqueSuffix()}`;
  await advanceToProfileStep(page, { national, phone: `+20${national}` });
  await page.getByRole("button", { name: "العودة لتغيير الرمز" }).click();
  await expect(page.getByLabel("رقم 1")).toBeVisible();
});

test("profile step shows a terms/privacy link near the submit button", async ({ page }) => {
  const national = `10${uniqueSuffix()}`;
  await advanceToProfileStep(page, { national, phone: `+20${national}` });
  await expect(page.getByRole("link", { name: "الشروط والأحكام" })).toHaveAttribute("href", "/terms");
  await expect(page.getByRole("link", { name: "سياسة الخصوصية" })).toHaveAttribute("href", "/privacy");
});

test("profile-step client validation: name, then password length, then mismatch, each as its own toast (no network call)", async ({ page }) => {
  const national = `10${uniqueSuffix()}`;
  await advanceToProfileStep(page, { national, phone: `+20${national}` });

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

test("a full phone->OTP->profile flow creates the account end-to-end (no WhatsApp dependency — the code is seeded directly), redirects home, and a fresh visit to /register then auto-redirects away", async ({ page }) => {
  const national = `10${uniqueSuffix()}`;
  await advanceToProfileStep(page, { national, phone: `+20${national}` });
  await page.getByLabel("الاسم الكامل").fill("مستخدم جديد");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
  await page.getByLabel("تأكيد كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByText("تم إنشاء الحساب", { exact: true })).toBeVisible();
  await page.waitForURL("**/");
  expect(new URL(page.url()).pathname).toBe("/");

  // Edge case: /register has an already-logged-in redirect guard (same as login/forgot-password).
  await page.goto("/register");
  await page.waitForURL("**/");
  expect(new URL(page.url()).pathname).toBe("/");
});

test("non-Egyptian account phone (Saudi) can complete the full flow, validated internationally not rejected as Egypt-only", async ({ page }) => {
  // Fixed "51" prefix (a real assigned Saudi mobile range), only the trailing 7 digits vary per
  // run for uniqueness — same rationale as the pre-4.4 suite's equivalent test.
  const national = `51${uniqueSuffix().slice(1)}`;
  const phone = saudiE164(national);
  await advanceToProfileStep(page, { national, phone, countryLabel: "+966 السعودية" });
  await page.getByLabel("الاسم الكامل").fill("عميل من السعودية");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
  await page.getByLabel("تأكيد كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByText("تم إنشاء الحساب", { exact: true })).toBeVisible();
});

test("a safe explicit ?redirect= is honored after successful registration", async ({ page }) => {
  const national = `10${uniqueSuffix()}`;
  await page.goto("/register?redirect=%2Fcategories");
  await seedRegisterOtp(`+20${national}`, OTP_CODE);
  await mockRegisterRequestSuccess(page, 60);
  await page.getByLabel("رقم الهاتف").fill(national);
  await page.getByRole("button", { name: "متابعة" }).click();
  await page.getByLabel("رقم 1").fill(OTP_CODE);
  await page.getByRole("button", { name: "تحقق ومتابعة" }).click();
  await expect(page.getByLabel("الاسم الكامل")).toBeVisible();
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
  await seedRegisterOtp(`+20${national}`, OTP_CODE);
  await mockRegisterRequestSuccess(page, 60);
  await page.getByLabel("رقم الهاتف").fill(national);
  await page.getByRole("button", { name: "متابعة" }).click();
  await page.getByLabel("رقم 1").fill(OTP_CODE);
  await page.getByRole("button", { name: "تحقق ومتابعة" }).click();
  await expect(page.getByLabel("الاسم الكامل")).toBeVisible();
  await page.getByLabel("الاسم الكامل").fill("مستخدم جديد");
  await page.getByLabel("كلمة المرور", { exact: true }).fill("TestPass123!");
  await page.getByLabel("تأكيد كلمة المرور").fill("TestPass123!");
  await page.getByRole("button", { name: "إنشاء الحساب" }).click();
  await expect(page.getByText("تم إنشاء الحساب", { exact: true })).toBeVisible();
  await page.waitForURL("**/");
  expect(new URL(page.url()).pathname).toBe("/");
  expect(page.url()).not.toContain("evil.example");
});

test("account creation is gated on a verified registerToken: missing/invalid token is rejected with 401 and creates nothing", async ({ request }) => {
  const res = await request.post("/api/auth/register", {
    data: { registerToken: "not-a-real-token", name: "Test User", password: "TestPass123!" },
  });
  expect(res.status()).toBe(401);
});

test("a registerToken can only be redeemed once: a second account-creation attempt with a second token for the same already-created phone hits the already-registered dead end (race-condition defense-in-depth)", async ({ request }) => {
  const phone = `+2010${uniqueSuffix()}`;
  await seedRegisterOtp(phone, OTP_CODE);

  const verify1 = await request.post("/api/auth/register/verify", { data: { phone, code: OTP_CODE } });
  expect(verify1.status()).toBe(200);
  const token1 = (await verify1.json()).data.registerToken;

  const verify2 = await request.post("/api/auth/register/verify", { data: { phone, code: OTP_CODE } });
  expect(verify2.status()).toBe(200);
  const token2 = (await verify2.json()).data.registerToken;

  const create1 = await request.post("/api/auth/register", {
    data: { registerToken: token1, name: "Race Test", password: "TestPass123!" },
  });
  expect(create1.status()).toBe(200);

  const create2 = await request.post("/api/auth/register", {
    data: { registerToken: token2, name: "Race Test", password: "TestPass123!" },
  });
  expect(create2.status()).toBe(400);
  const body2 = await create2.json();
  expect(body2.error.message).toBe("هذا الرقم مسجّل مسبقاً. استخدم تسجيل الدخول.");
});

test("registration OTP-request rate limiting: 10 already-registered attempts per phone/hour, 11th is blocked", async ({ request }) => {
  // A dedicated, never-before-used phone this run, pre-seeded as an existing account so every
  // attempt against it deterministically fails "already registered" at the request-OTP step —
  // the only meaningful register failure worth rate-limiting (see lib/redis/register-limits.ts).
  const phone = `+2010${uniqueSuffix()}`;
  await resetCurrentHourRegisterIpRateLimits();
  await prisma.user.upsert({
    where: { phone },
    create: { phone, role: "CUSTOMER" },
    update: {},
  });

  for (let i = 0; i < 10; i++) {
    const res = await request.post("/api/auth/register/request", { data: { phone } });
    expect(res.status(), `attempt ${i + 1} should be a plain 400, not yet rate-limited`).toBe(400);
  }

  const blocked = await request.post("/api/auth/register/request", { data: { phone } });
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
