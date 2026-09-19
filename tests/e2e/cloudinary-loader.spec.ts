import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { test, expect } from "@playwright/test";

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
});
