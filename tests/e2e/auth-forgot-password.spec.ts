import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { Redis } from "@upstash/redis";
import parsePhoneNumber from "libphonenumber-js/mobile";

// Regression coverage for backlog task 4.3 (Forgot password), mirroring tests/e2e/
// auth-login.spec.ts / auth-register.spec.ts's pattern (real DB-seeded fixtures, RTL/label
// checks, serial mode for shared Redis state). Covers docs/redesign/00-feature-inventory/auth/
// forgot-password.md's key states: the select-then-input field order (the intentional reverse
// of login/register), the ADMIN-block/no-account/passwordless combined-message error paths, the
// international account-phone lookup, the OTP box auto-advance/backspace/paste-fanout behavior,
// the resend cooldown countdown, "تغيير الرقم"/"العودة لتغيير الرمز" back-navigation, the
// verify-attempt lock, a real (non-mocked) verify+reset round trip proving no auto-login, the
// resetToken-lost-on-refresh edge case, and the new already-logged-in redirect guard.
//
// Twilio note: this is the one auth screen that actually sends real OTP SMS via Twilio in
// production. This suite deliberately never triggers a real Twilio send:
//   - The ADMIN-block / no-account / passwordless-account / invalid-format request-route paths
//     all return before `requestOtp()` (the only Twilio-calling function) is ever invoked, so
//     they're tested against the real, unmocked route with zero stubbing.
//   - Every "the phone step succeeds and advances to the OTP step" scenario mocks only the
//     browser's network call to `/api/auth/forgot-password/request` (via page.route), so the
//     client-side UI (step transition, cooldown countdown, OTP boxes) is exercised for real
//     without ever reaching the live route/Twilio.
//   - The actual OTP `verify` and `reset` routes touch zero Twilio code (only DB/Redis/JWT), so
//     those run for real, unmocked, against a known OTP code seeded directly into the
//     `OTPRequest` table (hashed the same way `lib/auth/otp.ts`'s `hashOtp` does) — this proves
//     the real server-side lock/attempt-counter/reset-JWT logic without needing to receive a
//     real SMS, which isn't practically possible from this environment. See
//     docs/redesign/03-backlog.md 4.3's verification note and the Twilio "Geographic
//     Permissions" operational gap already logged in docs/redesign/04-decisions.md.

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

/** Mirrors lib/auth/otp.ts's hashOtp exactly (sha256 of the first 16 chars of JWT_SECRET + code). */
function hashOtp(code: string): string {
  const salt = (process.env.JWT_SECRET ?? "").slice(0, 16);
  return crypto.createHash("sha256").update(salt + code).digest("hex");
}

/** A real, validly-formatted Saudi mobile number in E.164 — mirrors lib/phone.ts's own parsing
 * for a single country, duplicated locally rather than importing "@/lib/phone" (no other e2e
 * spec imports via the "@/" alias; scripts/*.ts establish the same "duplicate a small local
 * helper" precedent for standalone Node contexts outside Next's own module resolution). */
function saudiE164(national: string): string {
  const phone = parsePhoneNumber(`+966${national}`, "SA");
  if (!phone || !phone.isValid()) {
    throw new Error(`test fixture: "${national}" did not parse as a valid Saudi mobile number`);
  }
  return phone.number;
}

let seq = 0;
/** Fresh 8-digit suffix per call, even across calls in the same millisecond. */
function uniqueSuffix(): string {
  seq += 1;
  return String(Date.now() + seq).slice(-8).padStart(8, "0");
}

async function clearOtpRedisState(phone: string): Promise<void> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return; // best-effort; the tests below still mostly hold without this
  const redis = new Redis({ url, token });
  await redis.del(`otp:cooldown:${phone}`, `otp:lock:${phone}`, `otp:verify_attempts:${phone}`);
}

/** Intercepts the browser's call to the request route and fabricates a success response,
 * without ever reaching the real route (see the Twilio note above). */
async function mockRequestSuccess(page: Page, cooldownSeconds: number): Promise<void> {
  await page.route("**/api/auth/forgot-password/request", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: { cooldownSeconds },
        message: "تم إرسال رمز التحقق إلى جوالك",
      }),
    });
  });
}

const OTP_LENGTH = 6;
const OTP_CODE = "482913";

const ADMIN_PHONE = "+201099911100";
const ADMIN_SAUDI_PHONE = saudiE164("512340001");
const NO_PASSWORD_PHONE = "+201099911200";
const RESET_FLOW_PHONE = "+201099911300";
const WRONG_CODE_PHONE = "+201099911400";
const LOCK_PHONE = "+201099911500";
const GUARD_LOGIN_PHONE = "+201099911600";
const GUARD_LOGIN_PASSWORD = "TestPass123!";
const RESET_FLOW_OLD_PASSWORD = "OldPass123!";
const RESET_FLOW_NEW_PASSWORD = "NewPass456!";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await Promise.all(
    [ADMIN_PHONE, ADMIN_SAUDI_PHONE, RESET_FLOW_PHONE, WRONG_CODE_PHONE, LOCK_PHONE].map(
      clearOtpRedisState
    )
  );

  await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword("whatever123") },
    update: { role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { phone: ADMIN_SAUDI_PHONE },
    create: {
      phone: ADMIN_SAUDI_PHONE,
      role: "ADMIN",
      passwordHash: await hashPassword("whatever123"),
    },
    update: { role: "ADMIN" },
  });
  await prisma.user.upsert({
    where: { phone: NO_PASSWORD_PHONE },
    create: { phone: NO_PASSWORD_PHONE, role: "CUSTOMER" },
    update: { passwordHash: null, role: "CUSTOMER" },
  });
  await prisma.user.upsert({
    where: { phone: RESET_FLOW_PHONE },
    create: {
      phone: RESET_FLOW_PHONE,
      role: "CUSTOMER",
      passwordHash: await hashPassword(RESET_FLOW_OLD_PASSWORD),
    },
    update: { passwordHash: await hashPassword(RESET_FLOW_OLD_PASSWORD), role: "CUSTOMER" },
  });
  await prisma.user.upsert({
    where: { phone: WRONG_CODE_PHONE },
    create: {
      phone: WRONG_CODE_PHONE,
      role: "CUSTOMER",
      passwordHash: await hashPassword("SomePass123!"),
    },
    update: { passwordHash: await hashPassword("SomePass123!"), role: "CUSTOMER" },
  });
  await prisma.user.upsert({
    where: { phone: LOCK_PHONE },
    create: { phone: LOCK_PHONE, role: "CUSTOMER", passwordHash: await hashPassword("SomePass123!") },
    update: { passwordHash: await hashPassword("SomePass123!"), role: "CUSTOMER" },
  });
  await prisma.user.upsert({
    where: { phone: GUARD_LOGIN_PHONE },
    create: {
      phone: GUARD_LOGIN_PHONE,
      role: "CUSTOMER",
      passwordHash: await hashPassword(GUARD_LOGIN_PASSWORD),
    },
    update: { passwordHash: await hashPassword(GUARD_LOGIN_PASSWORD), role: "CUSTOMER" },
  });

  // Seed known-code OTPRequest rows directly (bypasses Twilio entirely — see file header).
  const future = new Date(Date.now() + 10 * 60 * 1000);
  await prisma.oTPRequest.deleteMany({
    where: { phone: { in: [RESET_FLOW_PHONE, WRONG_CODE_PHONE, LOCK_PHONE] }, purpose: "forgot_password" },
  });
  await prisma.oTPRequest.createMany({
    data: [RESET_FLOW_PHONE, WRONG_CODE_PHONE, LOCK_PHONE].map((phone) => ({
      phone,
      codeHash: hashOtp(OTP_CODE),
      expiresAt: future,
      purpose: "forgot_password",
    })),
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("renders RTL with real labels and the select-before-phone field order (reverse of login/register)", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

  const phoneInput = page.getByLabel("رقم الهاتف");
  const countrySelect = page.getByLabel("رمز الدولة");
  await expect(phoneInput).toBeVisible();
  await expect(countrySelect).toBeVisible();

  const phoneBox = await phoneInput.boundingBox();
  const selectBox = await countrySelect.boundingBox();
  expect(phoneBox).not.toBeNull();
  expect(selectBox).not.toBeNull();
  // forgot-password.md: select-then-input, the reverse of login/register's input-then-select.
  // In RTL, the first DOM child renders furthest right (higher x) — here that's the select,
  // unlike login/register where the phone input is first in the DOM and therefore rightmost.
  expect(selectBox!.x).toBeGreaterThan(phoneBox!.x);
});

test("keyboard reachability and a visible focus state", async ({ page }) => {
  await page.goto("/forgot-password");
  const phoneInput = page.getByLabel("رقم الهاتف");
  await phoneInput.focus();
  await expect(phoneInput).toBeFocused();
  const boxShadow = await phoneInput.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(boxShadow).not.toBe("none");

  const submitButton = page.getByRole("button", { name: "إرسال رمز التحقق" });
  await submitButton.focus();
  await expect(submitButton).toBeFocused();
  const btnShadow = await submitButton.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(btnShadow).not.toBe("none");
});

test("empty phone submit toasts and never calls the server", async ({ page }) => {
  let called = false;
  await page.route("**/api/auth/forgot-password/request", async (route) => {
    called = true;
    await route.continue();
  });
  await page.goto("/forgot-password");
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await expect(page.getByText("أدخل رقم الجوال", { exact: true })).toBeVisible();
  expect(called).toBe(false);
});

test("an ADMIN account phone is always blocked with the 403 dead-end message, before any OTP is sent", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await expect(page.getByText("لا يمكن استعادة كلمة المرور لهذا الرقم", { exact: true })).toBeVisible();
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible(); // stays on the phone step
});

test("an unregistered phone shows the combined no-account/no-password message", async ({ page }) => {
  const national = `10${uniqueSuffix()}`;
  await page.goto("/forgot-password");
  await page.getByLabel("رقم الهاتف").fill(national);
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await expect(
    page.getByText("لا يوجد حساب بهذا الرقم أو الحساب لا يستخدم كلمة مرور", { exact: true })
  ).toBeVisible();
});

test("a passwordless (OTP-only) account shows the identical combined message, not a distinguishing one", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page.getByLabel("رقم الهاتف").fill(NO_PASSWORD_PHONE.replace("+20", ""));
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await expect(
    page.getByText("لا يوجد حساب بهذا الرقم أو الحساب لا يستخدم كلمة مرور", { exact: true })
  ).toBeVisible();
});

test("non-Egyptian (Saudi) account phone is validated internationally: a Saudi ADMIN phone is looked up and blocked with the same 403, not rejected as an invalid format", async ({
  page,
}) => {
  await page.goto("/forgot-password");
  await page.getByLabel("رقم الهاتف").fill("512340001");
  await page.getByLabel("رمز الدولة").selectOption({ label: "+966 السعودية" });
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await expect(page.getByText("لا يمكن استعادة كلمة المرور لهذا الرقم", { exact: true })).toBeVisible();
});

test("an unparseable phone number shows the international account-phone format error", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("رقم الهاتف").fill("123");
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await expect(page.getByText("رقم الجوال غير صحيح لهذه الدولة", { exact: true })).toBeVisible();
});

test("a successful request advances to the OTP step, ticks the resend cooldown, allows resend once it clears, and 'تغيير الرقم' returns to the phone step with the phone preserved", async ({
  page,
}) => {
  await mockRequestSuccess(page, 2);
  await page.goto("/forgot-password");
  const national = "1099911700";
  await page.getByLabel("رقم الهاتف").fill(national);
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await expect(page.getByText("تم إرسال رمز التحقق", { exact: true })).toBeVisible();
  await expect(page.getByText(`أدخل الرمز المرسل إلى +20 ${national}`, { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: /إعادة الإرسال بعد \d+ ثانية/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "إعادة إرسال الرمز" })).toBeEnabled({ timeout: 4000 });

  await page.getByRole("button", { name: "إعادة إرسال الرمز" }).click();
  await expect(page.getByText("تم إرسال رمز جديد", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "تغيير الرقم" }).click();
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible();
  await expect(page.getByLabel("رقم الهاتف")).toHaveValue(national);
});

test("OTP boxes auto-advance on digit entry, backspace on an empty box moves focus back, and a multi-digit fill fans out across the remaining boxes", async ({
  page,
}) => {
  await mockRequestSuccess(page, 60);
  await page.goto("/forgot-password");
  await page.getByLabel("رقم الهاتف").fill("1099911800");
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await expect(page.getByText("تم إرسال رمز التحقق", { exact: true })).toBeVisible();

  const boxes = Array.from({ length: OTP_LENGTH }, (_, i) => page.getByLabel(`رقم ${i + 1}`));
  await expect(boxes[0]).toBeFocused();

  await page.keyboard.type("123");
  await expect(boxes[0]).toHaveValue("1");
  await expect(boxes[1]).toHaveValue("2");
  await expect(boxes[2]).toHaveValue("3");
  await expect(boxes[3]).toBeFocused();

  // Backspace on the empty focused box (index 3) moves focus back to box 2 — confirmed via a
  // real browser run (not an assumption) that this also clears box 2's own digit: the keydown
  // handler's `.focus()` call moves focus to box 2 synchronously, before the physical
  // backspace's native default deletion runs, so that deletion lands on box 2 (now focused)
  // rather than box 3. This is unchanged, pre-existing behavior — this handler is a verbatim
  // copy of the original implementation's (same event wiring, no preventDefault either before
  // or after this rebuild), not a regression introduced here. Preserved as-is per this task's
  // parity scope; not one of the two approved changes.
  await page.keyboard.press("Backspace");
  await expect(boxes[2]).toBeFocused();
  await expect(boxes[2]).toHaveValue("");

  // Retype box 2's digit (proves normal single-digit entry still works after the backspace
  // above) before checking the fan-out below.
  await page.keyboard.type("3");
  await expect(boxes[2]).toHaveValue("3");
  await expect(boxes[3]).toBeFocused();

  // A multi-character update starting at box 3 (paste-equivalent — the fan-out logic keys off
  // value length, not the paste event itself) fans out left-to-right and clamps at the last box.
  await boxes[3].fill("456789");
  await expect(boxes[3]).toHaveValue("4");
  await expect(boxes[4]).toHaveValue("5");
  await expect(boxes[5]).toHaveValue("6");
  await expect(boxes[5]).toBeFocused();

  await expect(page.getByRole("button", { name: "تحقق ومتابعة" })).toBeEnabled();
});

test("a real OTP verify + password reset succeeds end-to-end (no Twilio dependency — the code is seeded directly), does not auto-login, and the new password works on /login while the old one no longer does", async ({
  page,
}) => {
  await mockRequestSuccess(page, 60);
  await page.goto("/forgot-password");
  const national = RESET_FLOW_PHONE.replace("+20", "");
  await page.getByLabel("رقم الهاتف").fill(national);
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await expect(page.getByText("تم إرسال رمز التحقق", { exact: true })).toBeVisible();

  const boxes = Array.from({ length: OTP_LENGTH }, (_, i) => page.getByLabel(`رقم ${i + 1}`));
  await boxes[0].fill(OTP_CODE);
  await expect(page.getByRole("button", { name: "تحقق ومتابعة" })).toBeEnabled();
  await page.getByRole("button", { name: "تحقق ومتابعة" }).click();

  await expect(page.getByText("تم التحقق", { exact: true })).toBeVisible();
  await expect(page.getByLabel("كلمة المرور الجديدة")).toBeVisible();

  await page.getByLabel("كلمة المرور الجديدة").fill(RESET_FLOW_NEW_PASSWORD);
  await page.getByLabel("تأكيد كلمة المرور").fill(RESET_FLOW_NEW_PASSWORD);
  await page.getByRole("button", { name: "حفظ كلمة المرور" }).click();

  await expect(page.getByText("تم تغيير كلمة المرور", { exact: true })).toBeVisible();
  await page.waitForURL("**/login");
  expect(new URL(page.url()).pathname).toBe("/login");
  // Does NOT auto-login (unlike register): the login FORM is shown, not a redirect-away, which
  // only happens for a visitor with no active session.
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible();

  const oldPwRes = await page.request.post("/api/auth/login", {
    data: { phone: RESET_FLOW_PHONE, password: RESET_FLOW_OLD_PASSWORD },
  });
  expect(oldPwRes.status()).toBe(401);

  const newPwRes = await page.request.post("/api/auth/login", {
    data: { phone: RESET_FLOW_PHONE, password: RESET_FLOW_NEW_PASSWORD },
  });
  expect(newPwRes.status()).toBe(200);
});

test("a wrong OTP code is rejected with a generic message and the digits are not cleared", async ({ page }) => {
  await mockRequestSuccess(page, 60);
  await page.goto("/forgot-password");
  const national = WRONG_CODE_PHONE.replace("+20", "");
  await page.getByLabel("رقم الهاتف").fill(national);
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await expect(page.getByText("تم إرسال رمز التحقق", { exact: true })).toBeVisible();

  const boxes = Array.from({ length: OTP_LENGTH }, (_, i) => page.getByLabel(`رقم ${i + 1}`));
  await boxes[0].fill("000000");
  await page.getByRole("button", { name: "تحقق ومتابعة" }).click();
  await expect(page.getByText("رمز التحقق غير صحيح", { exact: true })).toBeVisible();
  await expect(boxes[0]).toHaveValue("0");
  await expect(boxes[5]).toHaveValue("0");
});

test("exceeding the max verify attempts locks the phone; even a subsequently correct code is rejected while locked", async ({
  request,
}) => {
  const setting = await prisma.siteSetting.findUnique({ where: { key: "otp_max_verify_attempts" } });
  const maxAttempts = setting?.value ? parseInt(setting.value, 10) : 5;

  for (let i = 0; i < maxAttempts; i++) {
    const res = await request.post("/api/auth/forgot-password/verify", {
      data: { phone: LOCK_PHONE, code: "999999" },
    });
    expect(res.status(), `attempt ${i + 1} should be a plain 400, not yet locked`).toBe(400);
    const body = await res.json();
    expect(body.error.message).toBe("رمز التحقق غير صحيح");
  }

  const lockedRes = await request.post("/api/auth/forgot-password/verify", {
    data: { phone: LOCK_PHONE, code: "999999" },
  });
  expect(lockedRes.status()).toBe(429);
  const lockedBody = await lockedRes.json();
  expect(lockedBody.error.message).toContain("عدد المحاولات كبير");

  const correctButLockedRes = await request.post("/api/auth/forgot-password/verify", {
    data: { phone: LOCK_PHONE, code: OTP_CODE },
  });
  expect(correctButLockedRes.status()).toBe(429);
  const correctBody = await correctButLockedRes.json();
  expect(correctBody.error.message).toContain("مقفل");
});

test("refreshing mid-flow loses the in-memory reset progress by design — reopening the page starts over from the phone step", async ({
  page,
}) => {
  await mockRequestSuccess(page, 60);
  await page.goto("/forgot-password");
  await page.getByLabel("رقم الهاتف").fill("1099911900");
  await page.getByRole("button", { name: "إرسال رمز التحقق" }).click();
  await expect(page.getByText("تم إرسال رمز التحقق", { exact: true })).toBeVisible();
  await expect(page.getByLabel("رقم 1")).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible();
});

test("an already-logged-in visitor is redirected away from /forgot-password without seeing the form", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(GUARD_LOGIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(GUARD_LOGIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page.getByText("تم تسجيل الدخول", { exact: true })).toBeVisible();
  await page.waitForURL("**/");

  await page.goto("/forgot-password");
  await page.waitForURL("**/");
  expect(new URL(page.url()).pathname).toBe("/");
});

test("desktop viewport shows the shared two-pane brand layout alongside a fully usable form", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/forgot-password");
  await expect(page.getByText("قطن مصري", { exact: false })).toBeVisible();
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible();
});

test("mobile viewport collapses to a single centered card with no brand pane", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/forgot-password");
  await expect(page.getByText("قطن مصري", { exact: false })).toBeHidden();
  await expect(page.getByLabel("رقم الهاتف")).toBeVisible();
  await expect(page.getByRole("button", { name: "إرسال رمز التحقق" })).toBeVisible();
});
