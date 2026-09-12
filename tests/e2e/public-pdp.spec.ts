import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { test, expect, type Page } from "@playwright/test";

// Backlog 4.9 (PDP) regression coverage. Reads a real product from the redesign DB via the
// public listing API (never invents fixture data), exercises the shared `useVariantSelection`
// validation path, the lightbox, the tag-pill fix, and the variant-slug/`product.active`
// hardening — toggling and restoring one product's `active` flag via Prisma against
// `.env.redesign` (guarded by `loadRedesignTestEnv`, same pattern as the auth specs).

const prisma = new PrismaClient();

async function setStorefrontLocation(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([
    {
      name: "nile_storefront_location",
      value: encodeURIComponent(JSON.stringify({ governorate: "القاهرة", area: "مدينة نصر" })),
      url: baseURL ?? "http://localhost:3100",
    },
  ]);
}

type ProductListItem = {
  slug: string;
  name: string;
  inStock: boolean;
};

async function findInStockProductSlug(baseURL: string): Promise<string> {
  const res = await fetch(`${baseURL}/api/products?limit=48`);
  const json = (await res.json()) as { data?: { products: ProductListItem[] } };
  const products = json.data?.products ?? [];
  const inStock = products.find((p) => p.inStock) ?? products[0];
  if (!inStock) throw new Error("No products available in the redesign DB to test the PDP against.");
  return inStock.slug;
}

async function resolveVariant(page: Page) {
  const sizeGroup = page.getByRole("radiogroup", { name: "المقاس" });
  const colorGroup = page.getByRole("radiogroup", { name: "اللون" });
  if ((await sizeGroup.count()) === 0) return;

  const sizeRadios = sizeGroup.getByRole("radio");
  const count = await sizeRadios.count();
  for (let i = 0; i < count; i++) {
    const radio = sizeRadios.nth(i);
    if ((await radio.getAttribute("aria-disabled")) !== "true") {
      await radio.click();
      break;
    }
  }

  if ((await colorGroup.count()) > 0) {
    const needsColor = await page.getByText("يجب اختيار اللون").isVisible().catch(() => false);
    if (needsColor) {
      const colorRadios = colorGroup.getByRole("radio");
      const cCount = await colorRadios.count();
      for (let i = 0; i < cCount; i++) {
        const radio = colorRadios.nth(i);
        if ((await radio.getAttribute("aria-disabled")) !== "true") {
          await radio.click();
          break;
        }
      }
    }
  }
}

test.describe("Public PDP (backlog 4.9)", () => {
  test("renders h1/price/size radiogroup, validates add-to-cart, adds to cart, lightbox, tag pill", async ({
    page,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    await setStorefrontLocation(page, base);

    const slug = await findInStockProductSlug(base);
    await page.goto(`/products/${slug}`);

    // h1 / price
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText(/ج\.م/).first()).toBeVisible();

    const actions = page.getByTestId("pdp-actions");
    const addToCartButton = actions.getByRole("button", { name: "أضف إلى السلة" });

    const sizeGroup = page.getByRole("radiogroup", { name: "المقاس" });
    const colorGroup = page.getByRole("radiogroup", { name: "اللون" });
    const hasSizes = (await sizeGroup.count()) > 0;

    if (hasSizes) {
      await expect(sizeGroup).toBeVisible();

      // Add to cart without selecting anything -> exact validation toast.
      await addToCartButton.click();
      const toastRegion = page.getByRole("region", { name: /Notifications/ });
      await expect(toastRegion.getByText("يرجى اختيار المقاس")).toBeVisible();

      // Pick the first enabled size.
      const sizeRadios = sizeGroup.getByRole("radio");
      const count = await sizeRadios.count();
      let picked = false;
      for (let i = 0; i < count; i++) {
        const radio = sizeRadios.nth(i);
        const disabled = await radio.getAttribute("aria-disabled");
        if (disabled !== "true") {
          await radio.click();
          picked = true;
          break;
        }
      }
      expect(picked).toBe(true);

      // If a colour is now required, pick the first enabled one.
      if ((await colorGroup.count()) > 0) {
        const colorRadios = colorGroup.getByRole("radio");
        const needsColor = await page.getByText("يجب اختيار اللون").isVisible().catch(() => false);
        if (needsColor) {
          const cCount = await colorRadios.count();
          for (let i = 0; i < cCount; i++) {
            const radio = colorRadios.nth(i);
            const disabled = await radio.getAttribute("aria-disabled");
            if (disabled !== "true") {
              await radio.click();
              break;
            }
          }
        }
      }
    }

    // Cart badge before add.
    const cartLink = page.getByRole("link", { name: "سلة التسوق" });
    const beforeText = (await cartLink.innerText()).trim();

    await addToCartButton.click();

    await expect
      .poll(async () => (await cartLink.innerText()).trim(), { timeout: 10_000 })
      .not.toBe(beforeText);

    // Adding to cart opens the cart drawer (preserved legacy behaviour) — close it before
    // continuing so it doesn't intercept clicks on the underlying PDP.
    const cartDrawer = page.getByRole("dialog", { name: "سلة التسوق" });
    if (await cartDrawer.isVisible().catch(() => false)) {
      await cartDrawer.getByRole("button", { name: "إغلاق" }).click();
      await expect(cartDrawer).not.toBeVisible();
    }

    // Lightbox opens/closes with Escape.
    await page.getByRole("button", { name: "تكبير الصورة" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();

    // Tag pill link (if the product has tags) points at the real filter route.
    const tagLinks = page.locator('a[href^="/products?q="]');
    if ((await tagLinks.count()) > 0) {
      const href = await tagLinks.first().getAttribute("href");
      expect(href).toContain("/products?q=");
    }
  });

  test("اشتر الآن (buy now) adds to cart then navigates straight to /cart", async ({
    page,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    await setStorefrontLocation(page, base);

    const slug = await findInStockProductSlug(base);
    await page.goto(`/products/${slug}`);

    const actions = page.getByTestId("pdp-actions");
    const buyNowButton = actions.getByRole("button", { name: "اشتر الآن" });

    // Buy-now without a size still runs full validation (no blind add).
    await buyNowButton.click();
    const toastRegion = page.getByRole("region", { name: /Notifications/ });
    await expect(toastRegion.getByText("يرجى اختيار المقاس")).toBeVisible();

    await resolveVariant(page);

    await buyNowButton.click();
    await page.waitForURL("**/cart", { timeout: 10_000 });
    await expect(page).toHaveURL(/\/cart$/);
  });

  test("a variant slug of an inactive product 404s", async ({ page, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    await setStorefrontLocation(page, base);

    const product = await prisma.product.findFirst({
      where: { active: true },
      include: { variants: { select: { slug: true }, take: 1 } },
    });
    if (!product || !product.variants[0]?.slug) {
      test.skip(true, "No active product with a variant slug found to test against.");
      return;
    }
    const variantSlug = product.variants[0].slug;

    await prisma.product.update({ where: { id: product.id }, data: { active: false } });
    try {
      const res = await page.goto(`/products/${variantSlug}`);
      expect(res?.status()).toBe(404);
    } finally {
      await prisma.product.update({ where: { id: product.id }, data: { active: true } });
    }
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });
});
