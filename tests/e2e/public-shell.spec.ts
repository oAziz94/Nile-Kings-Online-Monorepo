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

test("at phone width the governorate pill never covers the footer's last line (backlog 7.2)", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const pill = page.getByRole("button", { name: "القاهرة" });
  await expect(pill).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const lastLine = page.locator("footer").getByText("صُنع في مصر");
  await expect(lastLine).toBeVisible();
  const [pillBox, lineBox] = await Promise.all([pill.boundingBox(), lastLine.boundingBox()]);
  if (!pillBox || !lineBox) throw new Error("boxes");
  // The footer row stacks at this width, so its last line spans the same x range as the pill;
  // the reserved band must put the pill entirely below the line.
  expect(pillBox.y).toBeGreaterThanOrEqual(lineBox.y + lineBox.height);
});

test("backlog 6.7 — with NEXT_PUBLIC_GA4_MEASUREMENT_ID unset (this spec's ordinary webServer), no request to googletagmanager.com leaves the page", async ({
  page,
  baseURL,
}) => {
  // Only meaningful against a server that actually has the var unset (every CI/normal run —
  // `playwright.config.ts`'s own `webServer` never sets it). `ga4.spec.ts` hand-starts a
  // separate server with the var set to exercise the opposite case, and when this file is run
  // against that same hand-started server (backlog 6.7's verification step), the server itself
  // — not this test process's own env — decides whether the tag is present; probe the served
  // HTML directly rather than trusting `process.env` here.
  const html = await (await page.request.get("/")).text();
  test.skip(html.includes("googletagmanager.com"), "GA4 var is set for this server run");
  await setStorefrontLocation(page, baseURL);
  const gtmRequests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("googletagmanager.com")) gtmRequests.push(req.url());
  });
  await page.goto("/");
  await expect(page.getByRole("banner")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(gtmRequests).toHaveLength(0);
  const hasGtag = await page.evaluate(() => typeof window.gtag === "function");
  expect(hasGtag).toBe(false);
});
