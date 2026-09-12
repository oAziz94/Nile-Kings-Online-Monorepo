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

  // The `<select>` renders immediately with only the "كل المقاسات" placeholder; the real size
  // facets stream in asynchronously from `/api/products/filters`. Poll for that to settle instead
  // of reading `options` once — the redesign catalog genuinely has size facets (confirmed live:
  // XS/S/M/L/XL/XXL/.../"مقاس موحد"), so this must never self-skip in a healthy run. A real
  // absence of sizes would still safely skip after the poll times out.
  const sizeSelect = page.locator("#catalog-size");
  await sizeSelect.waitFor({ state: "visible" });
  await expect
    .poll(async () => (await sizeSelect.locator("option").allTextContents()).length, {
      timeout: 10_000,
    })
    .toBeGreaterThan(1);

  const options = await sizeSelect.locator("option").allTextContents();
  const realSize = options.find((o) => o.trim() && o !== "كل المقاسات");
  test.skip(!realSize, "no size facets in the current catalog");

  await sizeSelect.selectOption({ label: realSize! });
  await expect(page).toHaveURL(/[?&]sizes=/);
});

test("the in-stock switch adds ?inStock=true to the URL", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/products");

  const toggle = page.locator("#catalog-in-stock");
  await toggle.waitFor({ state: "visible" });
  await toggle.click();

  await expect(page).toHaveURL(/[?&]inStock=true/);
});

test("narrowing the price range lowers the result count", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/products");

  const countRegion = page.locator('[aria-live="polite"]');
  await expect(countRegion).toContainText("منتجًا", { timeout: 15_000 });

  // Wait for the real per-catalog bounds to load (inputs start disabled until then).
  const maxInput = page.locator("#catalog-desktop-price-max-input");
  await expect(maxInput).toBeEnabled({ timeout: 10_000 });

  const readTotal = async () => {
    const text = await countRegion.locator("p").first().innerText();
    return Number(text.replace(/[^\d]/g, ""));
  };

  // The bounds-loaded state can briefly re-trigger a fetch (dependent price-bounds effect), so
  // poll rather than read once.
  let baselineTotal = 0;
  await expect
    .poll(async () => {
      baselineTotal = await readTotal();
      return baselineTotal;
    }, { timeout: 10_000 })
    .toBeGreaterThan(0);

  // Narrow the max bound down to the catalog's real floor (read from the min input, which
  // starts pinned to it) — the control clamps any lower value back up to the current min, so this
  // is the narrowest legal value and should exclude every product priced above the floor.
  const minInput = page.locator("#catalog-desktop-price-min-input");
  const floor = await minInput.inputValue();
  await maxInput.fill(floor);
  await maxInput.blur();

  await expect(page).toHaveURL(new RegExp(`[?&]maxPrice=${floor}(&|$)`), { timeout: 5_000 });
  await expect
    .poll(readTotal, { timeout: 10_000 })
    .toBeLessThan(baselineTotal);
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

test("browser back restores scroll position to the clicked card", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/products");

  const cards = page.locator("[data-row-id]");
  await expect(cards.first()).toBeVisible({ timeout: 15_000 });

  // Load a second page via infinite scroll so the restored count is provably more than the
  // first page size (9) — proves the "at least `restore.count`" re-fetch, not just page 1.
  await page.mouse.wheel(0, 4000);
  await expect
    .poll(async () => cards.count(), { timeout: 10_000 })
    .toBeGreaterThan(9);

  const target = cards.nth(9); // a card only present after the infinite-scroll fetch
  const targetId = await target.getAttribute("data-row-id");
  await target.locator("a").first().click();

  await page.waitForURL(/\/products\//, { timeout: 10_000 });
  await page.goBack();
  await page.waitForURL(/\/products$/, { timeout: 10_000 });

  const restored = page.locator(`[data-row-id="${targetId}"]`);
  await expect(restored).toBeInViewport({ timeout: 10_000 });
});
