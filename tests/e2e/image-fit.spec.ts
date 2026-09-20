import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { test, expect, type Page } from "@playwright/test";

// Backlog 10.20 — Product photos cropped, fit by shape. Reads real, active, in-stock,
// Cloudinary-backed products from the redesign DB (never invents fixture data), fetches each
// candidate's real pixel dimensions from Cloudinary's `fl_getinfo` transform (no local
// image-processing dependency needed), and picks one of each measured shape: landscape
// (w > h), tall portrait (w/h < 0.7), and ~4:5 (w/h between 0.7 and 0.85). Then asserts:
//  - PDP main image renders `data-fit="contain"` for all three, and the landscape one's
//    rendered width equals its frame's width (no side crop — `object-contain` never crops).
//  - Listing/card image renders `data-fit="contain"` (landscape, after `onLoad` reports
//    naturalWidth > naturalHeight) or `"cover"` (the two portrait shapes) once loaded.

const prisma = new PrismaClient();

type Shape = "landscape" | "portrait" | "portrait45";

type CandidateProduct = {
  slug: string;
  name: string;
  imageUrl: string;
};

type ShapedProduct = CandidateProduct & { width: number; height: number; shape: Shape };

function classifyShape(width: number, height: number): Shape | null {
  const ratio = width / height;
  if (ratio > 1) return "landscape";
  if (ratio < 0.7) return "portrait";
  if (ratio >= 0.7 && ratio <= 0.85) return "portrait45";
  return null;
}

/** Rewrites a Cloudinary upload URL to request `fl_getinfo`, which returns a small JSON payload
 * with the original asset's real pixel dimensions — no image download needed. DB `imageUrl`
 * values are plain uploads (`.../image/upload/v<n>/<public_id>.<ext>`, no transformation segment
 * — the transform is only ever inserted at render time by `cloudinaryLoader`), so this only needs
 * to insert `fl_getinfo/` right after `image/upload/`. */
function getInfoUrl(imageUrl: string): string | null {
  const match = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/.exec(imageUrl);
  if (!match) return null;
  const [, prefix, rest] = match;
  return `${prefix}fl_getinfo/${rest}`;
}

async function fetchDimensions(imageUrl: string): Promise<{ width: number; height: number } | null> {
  const url = getInfoUrl(imageUrl);
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = (await res.json()) as { input?: { width?: number; height?: number } };
    if (!json.input?.width || !json.input?.height) return null;
    return { width: json.input.width, height: json.input.height };
  } catch {
    return null;
  }
}

/** Finds one active, in-stock, Cloudinary-backed product per shape, reading real dimensions from
 * Cloudinary directly (`fl_getinfo`) rather than guessing from aspect-ratio metadata that doesn't
 * exist in the DB. Read-only — no Prisma writes. */
async function findShapedProducts(page: Page): Promise<Record<Shape, ShapedProduct>> {
  const listRes = await page.request.get("/api/products?inStock=true&limit=120");
  expect(listRes.ok()).toBeTruthy();
  const inStockSlugs = ((await listRes.json()).data.products as { slug: string }[]).map((p) => p.slug);

  const candidates = await prisma.product.findMany({
    where: { active: true, slug: { in: inStockSlugs }, imageUrl: { contains: "res.cloudinary.com" } },
    select: { slug: true, name: true, imageUrl: true },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  const found: Partial<Record<Shape, ShapedProduct>> = {};
  for (const c of candidates) {
    if (found.landscape && found.portrait && found.portrait45) break;
    if (!c.imageUrl) continue;
    const dims = await fetchDimensions(c.imageUrl);
    if (!dims) continue;
    const shape = classifyShape(dims.width, dims.height);
    if (!shape || found[shape]) continue;
    found[shape] = { slug: c.slug, name: c.name, imageUrl: c.imageUrl, width: dims.width, height: dims.height, shape };
  }

  const missing = (["landscape", "portrait", "portrait45"] as Shape[]).filter((s) => !found[s]);
  if (missing.length > 0) {
    throw new Error(
      `Could not find real products for shape(s) ${missing.join(", ")} among ${candidates.length} Cloudinary-backed active in-stock products in the redesign DB.`
    );
  }
  return found as Record<Shape, ShapedProduct>;
}

async function setStorefrontLocation(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([
    {
      name: "nile_storefront_location",
      value: encodeURIComponent(JSON.stringify({ governorate: "القاهرة", area: "مدينة نصر" })),
      url: baseURL ?? "http://localhost:3100",
    },
  ]);
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("Product photos fit by shape (backlog 10.20)", () => {
  let shaped: Record<Shape, ShapedProduct>;

  test.beforeAll(async ({ browser, baseURL }) => {
    const page = await browser.newPage();
    await setStorefrontLocation(page, baseURL);
    shaped = await findShapedProducts(page);
    await page.close();
  });

  for (const shape of ["landscape", "portrait", "portrait45"] as Shape[]) {
    test(`PDP main image is data-fit="contain" for a ${shape} product`, async ({ page, baseURL }) => {
      await setStorefrontLocation(page, baseURL);
      const p = shaped[shape];
      await page.goto(`/products/${p.slug}`);
      const mainImage = page.getByTestId("pdp-main-frame").locator("img").first();
      await expect(mainImage).toBeVisible({ timeout: 15_000 });
      await expect(mainImage).toHaveAttribute("data-fit", "contain", { timeout: 10_000 });

      if (shape === "landscape") {
        // `object-contain` never crops — the whole photo renders, so the rendered element's
        // width equals its frame's width (no side crop from an `object-cover` letterbox on the
        // other axis instead). Also confirm the natural dimensions really are landscape, so this
        // assertion is meaningful and not just testing the DB's own metadata.
        const frame = page.getByTestId("pdp-main-frame");
        const frameBox = await frame.boundingBox();
        const imgBox = await mainImage.boundingBox();
        expect(frameBox).toBeTruthy();
        expect(imgBox).toBeTruthy();
        expect(Math.round(imgBox!.width)).toBeCloseTo(Math.round(frameBox!.width), 0);
        const natural = await mainImage.evaluate((el: HTMLImageElement) => ({
          w: el.naturalWidth,
          h: el.naturalHeight,
        }));
        expect(natural.w).toBeGreaterThan(natural.h);
      }
    });
  }

  test("landscape card is data-fit=contain, portrait cards stay data-fit=cover on a listing page", async ({
    page,
    baseURL,
  }) => {
    await setStorefrontLocation(page, baseURL);

    for (const [shape, expectedFit] of [
      ["landscape", "contain"],
      ["portrait", "cover"],
      ["portrait45", "cover"],
    ] as [Shape, string][]) {
      const p = shaped[shape];
      await page.goto(`/products?q=${encodeURIComponent(p.name)}`);
      const card = page.locator(`[data-row-id="${await productIdOf(p.slug)}"]`).first();
      await expect(card).toBeVisible({ timeout: 15_000 });
      await card.scrollIntoViewIfNeeded();
      const img = card.locator("img").first();
      await expect(img).toHaveAttribute("data-fit", expectedFit, { timeout: 15_000 });
    }
  });
});

async function productIdOf(slug: string): Promise<string> {
  const product = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
  if (!product) throw new Error(`Product ${slug} not found when resolving its id for data-row-id lookup.`);
  return product.id;
}

test.describe("Image-fit screenshots (backlog 10.20)", () => {
  test("landscape product PDP and card at 1514×681 and 390×844", async ({ page, baseURL }) => {
    await setStorefrontLocation(page, baseURL);
    const listRes = await page.request.get("/api/products?inStock=true&limit=120");
    const inStockSlugs = ((await listRes.json()).data.products as { slug: string }[]).map((p) => p.slug);
    const candidates = await prisma.product.findMany({
      where: { active: true, slug: { in: inStockSlugs }, imageUrl: { contains: "res.cloudinary.com" } },
      select: { slug: true, name: true, imageUrl: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    let landscape: (CandidateProduct & { id: string }) | null = null;
    for (const c of candidates) {
      if (!c.imageUrl) continue;
      const dims = await fetchDimensions(c.imageUrl);
      if (dims && classifyShape(dims.width, dims.height) === "landscape") {
        const withId = await prisma.product.findUnique({ where: { slug: c.slug }, select: { id: true } });
        landscape = { slug: c.slug, name: c.name, imageUrl: c.imageUrl, id: withId!.id };
        break;
      }
    }
    if (!landscape) test.skip(true, "No landscape Cloudinary product found in the redesign DB.");

    // Names aren't unique across colour variants of the same design, so the search result can
    // list several cards for the same name — the exact card is picked by product id, same as
    // the fit assertion test above, so the screenshot really is this product's card.
    const cardSelector = `[data-row-id="${landscape!.id}"]`;

    // Desktop
    await page.setViewportSize({ width: 1514, height: 681 });
    await page.goto(`/products/${landscape!.slug}`);
    await expect(page.getByTestId("pdp-main-frame").locator("img").first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "test-results/10.20-pdp-landscape-desktop.png" });

    await page.goto(`/products?q=${encodeURIComponent(landscape!.name)}`);
    const desktopCard = page.locator(cardSelector).first();
    await expect(desktopCard).toBeVisible({ timeout: 15_000 });
    await desktopCard.scrollIntoViewIfNeeded();
    await expect(desktopCard.locator("img").first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "test-results/10.20-card-landscape-desktop.png" });

    // Mobile
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/products/${landscape!.slug}`);
    await expect(page.getByTestId("pdp-main-frame").locator("img").first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "test-results/10.20-pdp-landscape-mobile.png" });

    await page.goto(`/products?q=${encodeURIComponent(landscape!.name)}`);
    const mobileCard = page.locator(cardSelector).first();
    await expect(mobileCard).toBeVisible({ timeout: 15_000 });
    await mobileCard.scrollIntoViewIfNeeded();
    await expect(mobileCard.locator("img").first()).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "test-results/10.20-card-landscape-mobile.png" });
  });
});
