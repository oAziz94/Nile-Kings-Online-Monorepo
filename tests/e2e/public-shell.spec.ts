import { test, expect, type Page } from "@playwright/test";

// Backlog 4.6 (Public storefront shell) regression coverage — same one-happy-path-per-screen
// pattern as tests/e2e/smoke.spec.ts (see docs/redesign/04-decisions.md 2026-09-09 "Regression
// coverage persists past verification"). Covers the shared chrome every later storefront screen
// (4.7-4.10) depends on: the navbar (brand logo + cart link + account link), the footer's legal
// links, and a product card's primary CTA opening the QuickShopModal. No DB writes — read-only
// navigation plus DOM assertions — so tests/e2e/test-env.ts's guard does not apply here.
//
// Every test pre-seeds the `nile_storefront_location` cookie (the shared, out-of-scope
// `GovernorateSelector` infra — see `docs/redesign/00-feature-inventory/public/home.md` Notes)
// so its full-screen, non-dismissible "first-time visitor" modal never covers the chrome this
// spec actually verifies.

async function setStorefrontLocation(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([
    {
      name: "nile_storefront_location",
      value: encodeURIComponent(JSON.stringify({ governorate: "القاهرة", area: "مدينة نصر" })),
      url: baseURL ?? "http://localhost:3100",
    },
  ]);
}

test("navbar renders the brand logo, cart link and account link on the home page", async ({
  page,
  baseURL,
}) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/");

  const nav = page.getByRole("banner");
  await expect(nav).toBeVisible();

  await expect(nav.getByRole("link", { name: /قطن ملوك النيل/ })).toBeVisible();

  const cartLink = nav.getByRole("link", { name: "سلة التسوق" });
  await expect(cartLink).toBeVisible();
  await expect(cartLink).toHaveAttribute("href", "/cart");

  // Logged-out: account control is a plain link to /login (backlog 4.6's `accountMenu` behaviour).
  const accountLink = nav.getByRole("link", { name: "حسابي" });
  await expect(accountLink).toBeVisible();
  await expect(accountLink).toHaveAttribute("href", "/login");
});

test("footer legal links resolve to real pages, not dead anchors", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/");
  const footer = page.locator("footer");
  await footer.scrollIntoViewIfNeeded();

  const termsLink = footer.getByRole("link", { name: "الشروط والأحكام" });
  const privacyLink = footer.getByRole("link", { name: "سياسة الخصوصية" });
  await expect(termsLink).toHaveAttribute("href", "/terms");
  await expect(privacyLink).toHaveAttribute("href", "/privacy");

  await termsLink.click();
  await expect(page).toHaveURL(/\/terms$/);
  await expect(page.locator("body")).not.toContainText("404");
});

test("a product card's \"أضف إلى السلة\" opens the quick-shop dialog", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/products");

  const addToCartButton = page.getByRole("button", { name: "أضف إلى السلة" }).first();
  await addToCartButton.waitFor({ state: "visible" });
  await addToCartButton.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
});
