import { test, expect, type Page } from "@playwright/test";

// Backlog 4.10 (Cart page + mini-cart drawer) regression coverage — same one-spec-per-screen
// pattern as tests/e2e/public-shell.spec.ts. Guest cart only (no login). Every mutation goes
// through the real `/api/cart/*` routes against the dev server the Playwright config already
// points at the redesign Neon branch (`npm run dev:redesign`, see playwright.config.ts) — no
// direct Prisma access from this spec, so tests/e2e/test-env.ts's guard does not apply (same
// reasoning as public-shell.spec.ts). Cart-add never touches `stockReserved` (that only happens
// at checkout, `lib/checkout/place-order.ts`), so adding/removing a real catalog variant here is
// non-destructive to shared redesign-branch data.
//
// Fixtures are resolved at run time from the live product API, never hardcoded: the redesign
// branch is shared by several parallel test runs and manual sessions, and a hardcoded SKU's stock
// can be drained to zero between runs (it happened during 4.10's verification). Cart-add never
// touches `stockReserved` (only checkout does, lib/checkout/place-order.ts), so adding/removing a
// real catalog variant here is non-destructive to shared data.
const GOVERNORATE = "الجيزة";

type ApiVariant = {
  id: string;
  name: string;
  colorName: string | null;
  stockAvailable: number;
  priceEgp: number;
};
type ApiProduct = {
  name: string;
  slug: string;
  categorySlug: string;
  variants: ApiVariant[];
};

/**
 * Finds a real product + variant that satisfies the test's needs right now. `minStock` keeps the
 * stepper assertions meaningful; `singleColourAtSize` (drawer test) picks a size that has exactly
 * one colour so the PDP flow needs only the size chip; kids products are skipped because their
 * size labels are remapped for display (lib/size-display.ts) and the chip text would not equal
 * `variant.name`.
 */
async function findStockedVariant(
  page: Page,
  opts: { minStock: number; singleColourAtSize?: boolean }
): Promise<{ product: ApiProduct; variant: ApiVariant }> {
  const listRes = await page.request.get("/api/products?inStock=true&limit=60");
  expect(listRes.ok()).toBeTruthy();
  const list = (await listRes.json()).data.products as { slug: string }[];
  for (const { slug } of list) {
    const res = await page.request.get(`/api/products/${slug}`);
    if (!res.ok()) continue;
    const product = (await res.json()).data as ApiProduct;
    if (product.categorySlug === "kids") continue;
    for (const variant of product.variants) {
      if (variant.stockAvailable < opts.minStock) continue;
      if (opts.singleColourAtSize) {
        const sameSize = product.variants.filter((v) => v.name === variant.name);
        if (sameSize.length !== 1) continue;
      }
      return { product, variant };
    }
  }
  throw new Error("No stocked non-kids variant found on the redesign branch for this test.");
}

function friendlyLabel(v: ApiVariant): string {
  return v.colorName ? `المقاس ${v.name} · ${v.colorName}` : `المقاس ${v.name}`;
}

async function setGovernorate(page: Page) {
  const res = await page.request.post("/api/storefront/governorate", {
    data: { governorate: GOVERNORATE },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe("Cart page", () => {
  test("empty state renders with a link back to categories", async ({ page }) => {
    // A fresh guest with no cart items yet (governorate set so the location modal doesn't cover
    // the page, but nothing added to the cart).
    await setGovernorate(page);
    await page.goto("/cart");

    await expect(page.getByRole("heading", { name: "سلة التسوق" })).toBeVisible();
    await expect(page.getByText("سلة التسوق فارغة")).toBeVisible();
    const shopNowLink = page.getByRole("link", { name: "تسوق الآن" });
    await expect(shopNowLink).toBeVisible();
    await expect(shopNowLink).toHaveAttribute("href", "/categories");
  });

  test("add via API, stepper bounds, line math, remove back to empty", async ({ page }) => {
    await setGovernorate(page);

    // Resolve the real variant id + its price from the live product API (never hardcode a piastre
    // amount — the line-math assertions below must trace to what the server actually returns).
    const { product, variant } = await findStockedVariant(page, { minStock: 2 });
    const productJson = { data: product };
    const EXPECTED_FRIENDLY_LABEL = friendlyLabel(variant);
    const unitPriceEgp: number = variant.priceEgp;

    const addRes = await page.request.post("/api/cart/items", {
      data: { variantId: variant.id, quantity: 1 },
    });
    expect(addRes.ok()).toBeTruthy();

    await page.goto("/cart");

    const line = page.locator("li", { hasText: productJson.data.name }).first();
    await expect(line).toBeVisible();
    // Both the desktop and mobile row markup exist in the DOM at once (CSS `hidden`/`md:hidden`
    // toggles which is visible) — `.first()` since the default desktop viewport shows the first.
    await expect(line.getByText(EXPECTED_FRIENDLY_LABEL).first()).toBeVisible();

    // Desktop viewport in this project's default config → the desktop row is the visible one.
    const decrementBtn = line.getByRole("button", { name: /تقليل كمية/ }).first();
    const incrementBtn = line.getByRole("button", { name: /زيادة كمية/ }).first();
    await expect(decrementBtn).toBeDisabled(); // quantity 1 → decrement disabled

    // Line total at qty 1 == unit price (both the "سعر القطعة" line and the line total show the
    // same figure at qty 1, so at least one match is expected — use `.first()` to avoid a
    // strict-mode multi-match error rather than asserting a specific count here).
    await expect(
      line.getByText(unitPriceEgp.toLocaleString("en-US"), { exact: false }).first()
    ).toBeVisible();

    // Increment (stock is ≥2 by fixture selection, so + must be enabled and actually work).
    await incrementBtn.click();
    await expect(line.getByText("2", { exact: true }).first()).toBeVisible();
    await expect(decrementBtn).toBeEnabled();

    // Server subtotal must equal price * quantity for this single-line cart, and the summary
    // aside must show exactly that number (twice: المجموع الفرعي and الإجمالي), not a
    // client-recomputed one.
    const cartRes = await page.request.get("/api/cart");
    const cartJson = await cartRes.json();
    expect(cartJson.data.subtotalEgp).toBe(unitPriceEgp * 2);
    const summary = page.locator("aside", { hasText: "ملخص الطلب" });
    const summaryText = (await summary.innerText()).replace(/\s+/g, " ");
    const subtotalStr = cartJson.data.subtotalEgp.toLocaleString("en-US");
    const occurrences = summaryText.split(subtotalStr).length - 1;
    expect(occurrences).toBe(2);

    // "+" must disable exactly at the line's live maxQty (verifier-added: the
    // stepper-bounds rule was previously only exercised implicitly by the enabled-at-qty-2 check
    // above). Drive the line up to maxQty via the UI, confirm "+" disables there and the server
    // agrees no further increment is possible (a direct PATCH one past it 422s), then decrement
    // back down before the remove step below.
    const maxQty: number = cartJson.data.items[0].maxQty;
    expect(maxQty).toBeGreaterThanOrEqual(2);
    // Jump straight to maxQty through the API (clicking "+" once per unit would take minutes on
    // a well-stocked SKU), then reload and assert the UI reflects the ceiling.
    const toMaxRes = await page.request.patch(`/api/cart/items/${cartJson.data.items[0].id}`, {
      data: { quantity: maxQty },
    });
    expect(toMaxRes.ok()).toBeTruthy();
    await page.reload();
    await expect(line.getByText(String(maxQty), { exact: true }).first()).toBeVisible();
    await expect(incrementBtn).toBeDisabled();

    const overLimitRes = await page.request.patch(`/api/cart/items/${cartJson.data.items[0].id}`,
      { data: { quantity: maxQty + 1 } }
    );
    expect(overLimitRes.status()).toBe(422);

    // Decrement once from the ceiling — "+" must re-enable, "−" stays enabled above 1.
    await decrementBtn.click();
    await expect(line.getByText(String(maxQty - 1), { exact: true }).first()).toBeVisible();
    await expect(incrementBtn).toBeEnabled();

    // Remove → empty state. The desktop row's remove control is the exact-text "إزالة" button;
    // the mobile row's icon-only twin has a longer aria-label ("إزالة {name} من السلة") that also
    // substring-matches "إزالة", so scope to the visible desktop row explicitly.
    await line.getByRole("button", { name: "إزالة", exact: true }).click();
    await expect(page.getByText("سلة التسوق فارغة")).toBeVisible();
  });
});

test.describe("Mini-cart drawer", () => {
  test("opens after add-to-cart via the UI and links to /cart", async ({ page }) => {
    await setGovernorate(page);
    const { product: simple, variant: simpleVariant } = await findStockedVariant(page, {
      minStock: 1,
      singleColourAtSize: true,
    });
    const SIMPLE_VARIANT_SIZE_LABEL = simpleVariant.name;
    await page.goto(`/products/${simple.slug}`);

    // The PDP's own add-to-cart also calls `openDrawer()` (same as `QuickShopModal`) — exercises
    // the same code path without needing to drive the card's quick-shop dialog.
    // The PDP's size chips are a radiogroup since backlog 4.9 (real `role="radio"` items).
    const sizeButton = page
      .getByRole("radiogroup", { name: "المقاس" })
      .getByRole("radio", { name: SIMPLE_VARIANT_SIZE_LABEL, exact: true })
      .first();
    await sizeButton.click();

    // The PDP's own CTA is the first match — "من نفس الفئة" related-product cards below it repeat
    // the same label on each `ProductCard`.
    const addToCartButton = page.getByRole("button", { name: "أضف إلى السلة" }).first();
    await addToCartButton.click();

    const drawer = page.getByRole("dialog", { name: "سلة التسوق" });
    await expect(drawer).toBeVisible();
    const viewCartLink = drawer.getByRole("link", { name: "عرض السلة" });
    await expect(viewCartLink).toBeVisible();
    await expect(viewCartLink).toHaveAttribute("href", "/cart");

    // Cleanup: remove the line we just added so this spec doesn't leave cart state behind for
    // whichever guest-token cookie the next run picks up (each Playwright test gets a fresh
    // context/cookie jar, but keep the shared fixture variant's cart state tidy regardless).
    await viewCartLink.click();
    await expect(page).toHaveURL(/\/cart$/);
    const removeBtn = page.getByRole("button", { name: /^إزالة/ }).first();
    if (await removeBtn.isVisible().catch(() => false)) {
      await removeBtn.click();
    }
  });
});
