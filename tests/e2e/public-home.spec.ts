import { test, expect, type Page } from "@playwright/test";

// Backlog 4.7 (Home) regression coverage. No DB writes — read-only navigation plus DOM
// assertions — so tests/e2e/test-env.ts's guard does not apply here. Same
// storefront-location cookie pre-seed as tests/e2e/public-shell.spec.ts so the
// full-screen "first-time visitor" GovernorateSelector modal never covers the page.

async function setStorefrontLocation(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([
    {
      name: "nile_storefront_location",
      value: encodeURIComponent(JSON.stringify({ governorate: "القاهرة", area: "مدينة نصر" })),
      url: baseURL ?? "http://localhost:3100",
    },
  ]);
}

test("hero heading and slogan are visible", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "قطن ملوك النيل" })).toBeVisible();
  await expect(page.getByText("المصري").first()).toBeVisible();
  await expect(page.getByText("للمصري").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "تسوق الكولكشن" }).first()).toHaveAttribute("href", "/products");
});

test("the three category tiles link to their real category routes", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/");
  await expect(page.getByRole("link", { name: "تسوق رجالي" })).toHaveAttribute("href", "/categories/men");
  await expect(page.getByRole("link", { name: "تسوق حريمي" })).toHaveAttribute("href", "/categories/women");
  await expect(page.getByRole("link", { name: "تسوق أطفال" })).toHaveAttribute("href", "/categories/kids");
});

test("collection rails render with prev/next controls when they have more than 4 products", async ({
  page,
  baseURL,
}) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/");
  const railHeading = page.getByRole("heading", { name: "كولكشن السيدات" });
  await railHeading.scrollIntoViewIfNeeded();
  await expect(railHeading).toBeVisible();
  await expect(page.getByRole("button", { name: "السابق في كولكشن السيدات" })).toBeVisible();
  await expect(page.getByRole("button", { name: "التالي في كولكشن السيدات" })).toBeVisible();
});

test("collage tiles never link to a dead '#' href", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/");
  const collage = page.getByRole("region", { name: "مختارات من الكولكشن" });
  await collage.scrollIntoViewIfNeeded();
  // Three links; the bed-linen tile is a "coming soon" button (2026-09-12 user decision).
  const hrefs = await collage.getByRole("link").evaluateAll((links) => links.map((l) => l.getAttribute("href")));
  expect(hrefs.length).toBe(3);
  await expect(collage.getByRole("button", { name: /قريبًا/ })).toHaveCount(1);
  for (const href of hrefs) {
    expect(href).not.toBe("#");
    expect(href).toBeTruthy();
  }
});

test("collection rails do not auto-rotate — a rail's first card is unchanged after 7 seconds", async ({
  page,
  baseURL,
}) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/");
  const railHeading = page.getByRole("heading", { name: "كولكشن السيدات" });
  await railHeading.scrollIntoViewIfNeeded();
  const rail = page.getByRole("group", { name: "كولكشن السيدات" });
  const firstCardName = rail.locator("h3").first();
  await expect(firstCardName).toBeVisible();
  const before = await firstCardName.textContent();
  await page.waitForTimeout(7000);
  const after = await firstCardName.textContent();
  expect(after).toBe(before);
});
