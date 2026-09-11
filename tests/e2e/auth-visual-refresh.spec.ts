import { test, expect } from "@playwright/test";

/**
 * Backlog 4.5 (Auth visual refresh) — targeted coverage for behavior introduced by this task
 * that isn't already exercised by auth-login/auth-register/auth-forgot-password.spec.ts (those
 * cover the pre-existing business-logic parity; this file covers the new presentation-layer
 * pieces called out in 03-backlog.md/04-decisions.md as mandatory: the reduced-motion guard,
 * the crown remaining the primary mark, the password show/hide toggle's accessible name, and
 * the OTP verify-failure banner's accessibility semantics).
 * Added at verification time per docs/redesign/04-decisions.md's "add a smoke test" convention.
 *
 * The last test stubs the network response for /api/auth/register/request and .../verify
 * instead of exercising the real WaPilot-backed route — it only needs to assert on the client's
 * rendering of an error response, and stubbing avoids sharing the real IP-wide OTP rate limiter
 * with auth-register.spec.ts's own rate-limit test when run in the same parallel Playwright pass
 * (both hit the same endpoint from the same test-runner IP).
 */

test("crown stays the primary header mark across all three auth screens", async ({ page }) => {
  for (const path of ["/login", "/register", "/forgot-password"]) {
    await page.goto(path);
    const logo = page.getByRole("link", { name: /العودة للمتجر/ }).getByRole("img");
    await expect(logo).toBeVisible();
    const src = await logo.getAttribute("src");
    expect(src).toContain("logo-lapis");
  }
});

test("prefers-reduced-motion: reduce disables the ambient drift/rise/draw animations", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");

  const drift = page.locator(".nk-drift:visible").first();
  await expect(drift).toBeVisible();
  const animationName = await drift.evaluate((el) => getComputedStyle(el).animationName);
  expect(animationName).toBe("none");
});

test("no-preference motion setting DOES run the ambient drift animation (control case)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login");

  const drift = page.locator(".nk-drift:visible").first();
  await expect(drift).toBeVisible();
  const animationName = await drift.evaluate((el) => getComputedStyle(el).animationName);
  expect(animationName).toBe("nkDrift");
});

test("password show/hide toggle has its own accessible name, distinct from the field label, and actually toggles the input type", async ({
  page,
}) => {
  await page.goto("/login");
  const passwordInput = page.getByLabel("كلمة المرور", { exact: true });
  await expect(passwordInput).toHaveAttribute("type", "password");

  const toggle = page.getByRole("button", { name: "إظهار قيمة الحقل المُدخلة" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(passwordInput).toHaveAttribute("type", "text");
  await expect(page.getByRole("button", { name: "إخفاء قيمة الحقل المُدخلة" })).toBeVisible();
});

test("OTP verify-failure banner (register) is a real role=alert element, not just a toast", async ({
  page,
}) => {
  // Stub both calls: the "phone" step's send-OTP request (must succeed to reach the OTP step),
  // then the "otp" step's verify call (stubbed to fail) — isolates this UI-rendering assertion
  // from the real WaPilot-backed rate limiter shared with auth-register.spec.ts's own test.
  await page.route("**/api/auth/register/request", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { cooldownSeconds: 60 } }),
    })
  );
  await page.route("**/api/auth/register/verify", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: { message: "رمز التحقق غير صحيح" } }),
    })
  );

  await page.goto("/register");
  await page.getByLabel("رقم الهاتف").fill("1099922950");
  await page.getByRole("button", { name: "متابعة" }).click();
  await expect(page.getByRole("button", { name: "تحقق ومتابعة" })).toBeVisible();

  const boxes = page.getByLabel(/^رقم \d$/);
  const count = await boxes.count();
  for (let i = 0; i < count; i++) {
    await boxes.nth(i).fill("9");
  }
  await page.getByRole("button", { name: "تحقق ومتابعة" }).click();
  const alert = page.getByRole("alert").filter({ hasText: "رمز التحقق غير صحيح" });
  await expect(alert).toBeVisible();
  await expect(alert).toHaveText("رمز التحقق غير صحيح");
});
