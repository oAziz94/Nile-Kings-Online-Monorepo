import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { test, expect, type Page } from "@playwright/test";

// Backlog 6.4 — Cloudinary delivery through a `next/image` loader. Reads a real, active
// product whose image is a Cloudinary URL from the redesign DB (never invents fixture data,
// never seeds/deletes rows) and asserts the rendered <img src> was rewritten by
// `cloudinaryLoader` instead of round-tripping through Next's own `/_next/image` optimizer.

const prisma = new PrismaClient();

// Next's default `deviceSizes` + `imageSizes` union (next.config.ts sets neither, so these
// are the framework defaults) — the width the loader is asked for must be one of these.
const NEXT_IMAGE_WIDTHS = new Set([16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840]);

function assertCloudinaryOptimizedSrc(src: string | null) {
  expect(src).toBeTruthy();
  const url = src as string;
  expect(url).toContain("res.cloudinary.com");
  expect(url).toContain("f_auto");
  expect(url).toContain("q_auto");
  expect(url).toContain("c_limit");
  expect(url).not.toContain("/_next/image");
  const widthMatch = /(?:^|,|\/)w_(\d+)/.exec(url);
  expect(widthMatch).toBeTruthy();
  const width = Number(widthMatch?.[1]);
  expect(NEXT_IMAGE_WIDTHS.has(width)).toBe(true);
}

async function findCloudinaryProductSlug(): Promise<string> {
  const product = await prisma.product.findFirst({
    where: { active: true, imageUrl: { contains: "res.cloudinary.com" } },
    select: { slug: true },
    orderBy: { createdAt: "asc" },
  });
  if (!product) {
    throw new Error("No active product with a res.cloudinary.com imageUrl found in the redesign DB.");
  }
  return product.slug;
}

/** A cookieless fetch sees every product as out of stock (governorate → partner stock context) —
 * same gotcha noted in public-pdp.spec.ts. Sets it via the real API so it also applies to the
 * browser's own subsequent navigation, not just page.request calls. */
async function setStorefrontLocation(page: Page) {
  const res = await page.request.post("/api/storefront/governorate", {
    data: { governorate: "القاهرة" },
  });
  expect(res.ok()).toBeTruthy();
}

type ApiListProduct = { slug: string; inStock?: boolean };
type ApiVariant = { id: string; name: string; stockAvailable: number };
type ApiProductDetail = { name: string; variants: ApiVariant[] };

/** Finds a Cloudinary-backed, in-stock product, cross-referencing the live in-stock product list
 * (one request, same pattern as public-cart.spec.ts's findStockedVariant) against a read-only
 * Prisma lookup for which of those slugs has a res.cloudinary.com imageUrl — never a hardcoded
 * SKU, never a Prisma write, and never an unbounded per-slug request loop. */
async function findStockedCloudinaryProduct(
  page: Page
): Promise<{ slug: string; product: ApiProductDetail; variant: ApiVariant }> {
  const listRes = await page.request.get("/api/products?inStock=true&limit=60");
  expect(listRes.ok()).toBeTruthy();
  const inStockSlugs = ((await listRes.json()).data.products as ApiListProduct[]).map((p) => p.slug);
  if (inStockSlugs.length === 0) {
    throw new Error("No in-stock products found in the redesign DB.");
  }

  const cloudinaryMatches = await prisma.product.findMany({
    where: { active: true, slug: { in: inStockSlugs }, imageUrl: { contains: "res.cloudinary.com" } },
    select: { slug: true },
  });
  if (cloudinaryMatches.length === 0) {
    throw new Error("None of the in-stock products on the redesign DB has a res.cloudinary.com imageUrl.");
  }

  for (const { slug } of cloudinaryMatches) {
    const res = await page.request.get(`/api/products/${slug}`);
    if (!res.ok()) continue;
    const product = (await res.json()).data as ApiProductDetail;
    const variant = product.variants.find((v) => v.stockAvailable > 0);
    if (variant) return { slug, product, variant };
  }
  throw new Error("No in-stock variant found among Cloudinary-backed products in the redesign DB.");
}

/** Resolves the PDP's size/colour radiogroups to a buyable state (same minimal pattern as
 * tests/e2e/public-cart.spec.ts / public-pdp.spec.ts's `resolveVariant`), then adds to cart. */
async function addFirstBuyableVariantToCart(page: Page) {
  const sizeGroup = page.getByRole("radiogroup", { name: "المقاس" });
  if ((await sizeGroup.count()) > 0) {
    const sizeRadios = sizeGroup.getByRole("radio");
    const count = await sizeRadios.count();
    for (let i = 0; i < count; i++) {
      const radio = sizeRadios.nth(i);
      if ((await radio.getAttribute("aria-disabled")) !== "true") {
        await radio.click();
        break;
      }
    }
  }
  const colorGroup = page.getByRole("radiogroup", { name: "اللون" });
  if ((await colorGroup.count()) > 0) {
    const colorRadios = colorGroup.getByRole("radio");
    const count = await colorRadios.count();
    for (let i = 0; i < count; i++) {
      const radio = colorRadios.nth(i);
      if ((await radio.getAttribute("data-out-of-stock")) !== "true") {
        await radio.click();
        break;
      }
    }
  }
  await page.getByRole("button", { name: "أضف إلى السلة" }).first().click();
}

test.describe("Cloudinary loader (backlog 6.4)", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("PDP main image is served through the Cloudinary loader", async ({ page }) => {
    const slug = await findCloudinaryProductSlug();
    await page.goto(`/products/${slug}`);
    const mainImage = page.getByTestId("pdp-main-frame").locator("img").first();
    await expect(mainImage).toBeVisible();
    const src = await mainImage.evaluate((el: HTMLImageElement) => el.currentSrc || el.src);
    assertCloudinaryOptimizedSrc(src);
  });

  test("home page's first product card image is served through the Cloudinary loader", async ({ page }) => {
    // Confirms at least one Cloudinary product exists in the DB, then checks the home page's
    // product cards directly — the hero and category tiles are static `/brand/*` assets, so
    // this walks the `/products/<slug>` card links (not `main img`) to find the first one
    // whose image actually is a Cloudinary URL.
    await findCloudinaryProductSlug();
    await page.goto("/");
    const productCardImages = page.locator('a[href^="/products/"] img');
    const count = await productCardImages.count();
    expect(count).toBeGreaterThan(0);

    let matched: string | null = null;
    for (let i = 0; i < count; i++) {
      const el = productCardImages.nth(i);
      const src = await el.evaluate((img: HTMLImageElement) => img.currentSrc || img.src);
      if (src.includes("res.cloudinary.com")) {
        matched = src;
        break;
      }
    }
    assertCloudinaryOptimizedSrc(matched);
  });

  test("mini-cart drawer thumbnail is served through the Cloudinary loader after adding from the PDP", async ({
    page,
  }) => {
    // A few sequential lookups (in-stock list, per-slug detail) ahead of the real add-to-cart UI
    // flow can outrun the 30s default under a cold route compile.
    test.setTimeout(60_000);
    // Rework (verifier finding): components/cart/cart-drawer.tsx's mini-cart thumbnail still
    // rendered through /_next/image. Adds a real, in-stock, Cloudinary-backed variant from its
    // PDP (never a hardcoded SKU, never a Prisma write) and reads the drawer's own <img>.
    await setStorefrontLocation(page);
    const { slug } = await findStockedCloudinaryProduct(page);
    await page.goto(`/products/${slug}`);
    await addFirstBuyableVariantToCart(page);

    const drawer = page.getByRole("dialog", { name: "سلة التسوق" });
    await expect(drawer).toBeVisible();
    const thumbnail = drawer.locator("img").first();
    await expect(thumbnail).toBeVisible();
    const src = await thumbnail.evaluate((el: HTMLImageElement) => el.currentSrc || el.src);
    assertCloudinaryOptimizedSrc(src);

    // Cleanup: this is a guest cart (fresh context/cookie jar per test) — remove the line so no
    // state leaks into whatever guest-token cookie a later run of this file's context reuses.
    const viewCartLink = drawer.getByRole("link", { name: "عرض السلة" });
    await viewCartLink.click();
    await expect(page).toHaveURL(/\/cart$/);
    const removeBtn = page.getByRole("button", { name: /^إزالة/ }).first();
    if (await removeBtn.isVisible().catch(() => false)) {
      await removeBtn.click();
    }
  });

  test("a collection rail's card image requests at most a 640px width, not the grid's full-viewport default", async ({
    page,
  }) => {
    // Rework (verifier finding): CollectionRail's fixed 200/312px cards inherited ProductCard's
    // grid-default `sizes` ("up to 25vw of the viewport"), so the loader always requested the
    // largest device width (w_3840) for a card that never renders wider than 312px. `ProductCard`
    // now takes an explicit `sizes` override that `CollectionRail` passes.
    await page.goto("/");
    const rail = page.getByRole("group", { name: /كولكشن/ }).first();
    await rail.scrollIntoViewIfNeeded();
    const railImage = rail.locator("img").first();
    await expect(railImage).toBeVisible();
    await railImage.scrollIntoViewIfNeeded();
    const src = await railImage.evaluate((el: HTMLImageElement) => el.currentSrc || el.src);
    expect(src).toContain("res.cloudinary.com");
    const widthMatch = /(?:^|,|\/)w_(\d+)/.exec(src);
    expect(widthMatch).toBeTruthy();
    const width = Number(widthMatch?.[1]);
    expect(width).toBeLessThanOrEqual(640);
  });
});
