import { test, expect } from "@playwright/test";

// Phase 3.6 reference pattern: one happy-path smoke test per verified screen,
// added at ui-verifier sign-off time (see docs/redesign/04-decisions.md
// 2026-09-09 "Regression coverage persists past verification"). These two
// cover the only screens rebuilt so far at the foundation stage — home and
// login — as the template future Phase 4 tasks copy from, not full coverage.

test("home page loads and shows the hero", async ({ page }) => {
  await page.goto("/");
  // Backlog 4.7: hero heading rebuilt as "قطن ملوك النيل" (was "قطن مصري أصلي").
  await expect(page.getByRole("heading", { name: "قطن ملوك النيل" })).toBeVisible();
});

test("login page renders the phone/password form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByPlaceholder("1xxxxxxxxx")).toBeVisible();
  await expect(page.getByPlaceholder("كلمة المرور")).toBeVisible();
  await expect(page.getByRole("button", { name: "تسجيل الدخول" })).toBeVisible();
});
