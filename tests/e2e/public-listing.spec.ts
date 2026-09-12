import { test, expect, type Page } from "@playwright/test";

// Backlog 4.8 (Public storefront listing) regression coverage — `/products`,
// `/categories/[slug]`, `/categories`. Read-only navigation/DOM assertions, no DB writes, so
// tests/e2e/test-env.ts's guard does not apply (same precedent as public-shell.spec.ts).

async function setStorefrontLocation(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([
    {
      name: "nile_storefront_location",
      value: encodeURIComponent(JSON.stringify({ governorate: "القاهرة", area: "مدينة نصر" })),
      url: baseURL ?? "http://localhost:3100",
    },
  ]);
}

test("/products renders product cards and a live result count", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/products");

  await expect(page.getByRole("heading", { name: "كل المنتجات", level: 1 })).toBeVisible();

  const cards = page.locator("[data-row-id]");
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });

  // Live result count region.
  const countRegion = page.locator('[aria-live="polite"]');
  await expect(countRegion).toContainText("منتجًا");
});

test("searching a nonsense term shows the empty state with the query echoed", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/products");

  const search = page.locator("#catalog-search");
  await search.fill("zzzznonexistentproductxyz123");

  await expect(page.getByText("لم نجد ما تبحث عنه")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("0 نتائج لـ «zzzznonexistentproductxyz123»")).toBeVisible();
  await expect(page.getByRole("button", { name: "مسح البحث والفلاتر" })).toBeVisible();
});

test("/categories/men renders the category h1 and product cards", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/categories/men");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const cards = page.locator("[data-row-id]");
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });
});

test("the size filter updates the URL", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/products");

  const sizeSelect = page.locator("#catalog-size");
  await sizeSelect.waitFor({ state: "visible" });
  const options = await sizeSelect.locator("option").allTextContents();
  const realSize = options.find((o) => o.trim() && o !== "كل المقاسات");
  test.skip(!realSize, "no size facets in the current catalog");

  await sizeSelect.selectOption({ label: realSize! });
  await expect(page).toHaveURL(/[?&]size=/);
});

test("the in-stock switch adds ?inStock=true to the URL", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/products");

  const toggle = page.locator("#catalog-in-stock");
  await toggle.waitFor({ state: "visible" });
  await toggle.click();

  await expect(page).toHaveURL(/[?&]inStock=true/);
});

test("mobile: تصفية opens the filter dialog and عرض applies it", async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setStorefrontLocation(page, baseURL);
  await page.goto("/products");

  const filterButton = page.getByRole("button", { name: /تصفية/ });
  await filterButton.waitFor({ state: "visible" });
  await filterButton.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const inStockToggle = dialog.locator("#catalog-in-stock-mobile");
  await inStockToggle.click();

  const applyButton = dialog.getByRole("button", { name: /عرض .* منتجًا/ });
  await applyButton.click();

  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/[?&]inStock=true/);
});

test("/categories/does-not-exist returns 404", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  const response = await page.goto("/categories/does-not-exist");
  expect(response?.status()).toBe(404);
});

test("/categories renders category tiles with product counts", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/categories");

  await expect(page.getByRole("heading", { name: "التصنيفات", level: 1 })).toBeVisible();
  await expect(page.getByText("منتج").first()).toBeVisible({ timeout: 15_000 });
});
