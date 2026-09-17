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

// Uses `page.request` so the governorate cookie set above applies — a cookieless fetch sees
// every product as out of stock and silently falls back to the first product, whatever its
// stock (bit the merged suite once). Picks the first product with a sellable variant.
async function findInStockProductSlug(page: Page): Promise<string> {
  const res = await page.request.get("/api/products?inStock=true&limit=48");
  const json = (await res.json()) as { data?: { products: ProductListItem[] } };
  const products = json.data?.products ?? [];
  for (const p of products) {
    const detail = (await (await page.request.get(`/api/products/${p.slug}`)).json()) as {
      data?: { variants: { stockAvailable: number }[] };
    };
    if (detail.data?.variants.some((v) => v.stockAvailable > 0)) return p.slug;
  }
  throw new Error("No in-stock product available in the redesign DB to test the PDP against.");
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
    // Always pick an enabled colour when the group exists: the "choose a colour" toast only
    // appears AFTER a failed add, so gating on it can never work before the click.
    {
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

// Backlog 10.1/10.2 (owner's manual test findings, v2.4.0). A real product with 6 distinct
// colours already exists in the redesign DB (nk-7777), but no product in this DB snapshot has
// a populated per-colour `VariantImage` gallery — needed to prove the thumbnail-strip height cap
// with more than one thumbnail. This suite seeds exactly 6 `VariantImage` rows for one of
// nk-7777's real, existing colours (never touching its existing variant/product rows) and
// deletes precisely those seeded rows afterward (by id) — never a bulk/pattern delete.
const GALLERY_PRODUCT_SLUG = "nk-7777";
const GALLERY_COLOR_KEY = "wisteria|#C9A0DC";
const GALLERY_PHOTOS = [
  "https://res.cloudinary.com/dw2yigxcp/image/upload/v1773321245/nile-kings/products/xtznkqr6zj5zi799utum.jpg",
  "https://res.cloudinary.com/dw2yigxcp/image/upload/v1773324600/nile-kings/products/xiwrxjqselhf0oiw5atg.jpg",
  "https://res.cloudinary.com/dw2yigxcp/image/upload/v1773323682/nile-kings/products/t8hu6dvlmjpcttwqegcd.jpg",
  "https://res.cloudinary.com/dw2yigxcp/image/upload/v1773322074/nile-kings/products/fcae3x6eppamqsxxcg1j.jpg",
  "https://res.cloudinary.com/dw2yigxcp/image/upload/v1773325414/nile-kings/products/ldtrwaucuo1zaooqacur.jpg",
  "https://res.cloudinary.com/dw2yigxcp/image/upload/v1773321245/nile-kings/products/xtznkqr6zj5zi799utum.jpg",
];

const GALLERY_VIEWPORTS = [
  { width: 1514, height: 681 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
  { width: 375, height: 667 },
];

const seededVariantImageIds: string[] = [];

test.describe("Public PDP (backlog 4.9)", () => {
  test("renders h1/price/size radiogroup, validates add-to-cart, adds to cart, lightbox, tag pill", async ({
    page,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    await setStorefrontLocation(page, base);

    const slug = await findInStockProductSlug(page);
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
        // Always pick an enabled colour when the group exists: the "choose a colour" toast only
        // appears AFTER a failed add, so gating on it can never work before the click.
        {
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

    // Adding to cart opens the cart drawer (preserved legacy behaviour). Since 4.10 it is a real
    // modal (Radix Dialog): the rest of the page is aria-hidden while it is open, so the navbar
    // badge is unreachable by role until the drawer is closed — close it FIRST, then poll.
    const cartDrawer = page.getByRole("dialog", { name: "سلة التسوق" });
    await expect(cartDrawer).toBeVisible({ timeout: 10_000 });
    await cartDrawer.getByRole("button", { name: "إغلاق" }).click();
    await expect(cartDrawer).not.toBeVisible();

    await expect
      .poll(async () => (await cartLink.innerText()).trim(), { timeout: 10_000 })
      .not.toBe(beforeText);

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

    const slug = await findInStockProductSlug(page);
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

  test.beforeAll(async () => {
    const product = await prisma.product.findUnique({ where: { slug: GALLERY_PRODUCT_SLUG } });
    if (!product) {
      throw new Error(`Fixture product ${GALLERY_PRODUCT_SLUG} not found in the redesign DB.`);
    }
    for (let i = 0; i < GALLERY_PHOTOS.length; i++) {
      const row = await prisma.variantImage.create({
        data: { productId: product.id, colorKey: GALLERY_COLOR_KEY, url: GALLERY_PHOTOS[i], sortOrder: i },
      });
      seededVariantImageIds.push(row.id);
    }
  });

  test("backlog 10.1 — main frame + price fit above the fold at 1514×681, gallery proof screenshots", async ({
    page,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    await setStorefrontLocation(page, base);

    await page.setViewportSize({ width: 1514, height: 681 });
    await page.goto(`/products/${GALLERY_PRODUCT_SLUG}`);

    const frame = page.getByTestId("pdp-main-frame");
    await expect(frame).toBeVisible();
    const frameBox = await frame.boundingBox();
    expect(frameBox).not.toBeNull();
    // Whole photo visible: its bottom edge is above the viewport bottom, not clipped/cut off.
    expect(frameBox!.y + frameBox!.height).toBeLessThanOrEqual(681);

    await expect(page.locator("h1")).toBeVisible();
    const price = page.getByText(/ج\.م/).first();
    await expect(price).toBeVisible();
    const priceBox = await price.boundingBox();
    expect(priceBox).not.toBeNull();
    expect(priceBox!.y + priceBox!.height).toBeLessThanOrEqual(681);

    // Nothing overflows horizontally.
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(1514);

    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "screenshots/pdp-10.1-1514x681.png" });

    // Selecting the seeded 6-photo colour swaps to its gallery: the thumbnail strip now has more
    // thumbnails than fit in the capped height and scrolls vertically instead of growing past it.
    const wisteriaSwatch = page.getByRole("radio", { name: "wisteria" });
    await wisteriaSwatch.click();
    const thumbList = page.getByRole("list", { name: "صور المنتج" });
    await expect(thumbList.getByRole("listitem")).toHaveCount(GALLERY_PHOTOS.length);
    const [scrollHeight, clientHeight] = await thumbList.evaluate((el) => [el.scrollHeight, el.clientHeight]);
    expect(scrollHeight).toBeGreaterThan(clientHeight);
    const thumbBox = await thumbList.boundingBox();
    expect(thumbBox).not.toBeNull();
    expect(thumbBox!.y + thumbBox!.height).toBeLessThanOrEqual(681);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "screenshots/pdp-10.1-1514x681-scrollable-thumbnails.png" });

    for (const vp of GALLERY_VIEWPORTS.slice(1)) {
      await page.setViewportSize(vp);
      // The frame's size is JS-measured (ResizeObserver + a window resize listener), so give it
      // a moment to recompute, then let any newly-requested images finish loading.
      await page.waitForTimeout(200);
      await page.waitForLoadState("networkidle");
      const box = await frame.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
      await expect(page.locator("h1")).toBeVisible();
      await page.screenshot({ path: `screenshots/pdp-10.1-${vp.width}x${vp.height}.png` });
    }
  });

  test.afterAll(async () => {
    if (seededVariantImageIds.length > 0) {
      await prisma.variantImage.deleteMany({ where: { id: { in: seededVariantImageIds } } });
    }
    await prisma.$disconnect();
  });
});
