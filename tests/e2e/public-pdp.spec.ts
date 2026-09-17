import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { test, expect, devices, type Page } from "@playwright/test";

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
    // Always pick an in-stock colour when the group exists: the "choose a colour" toast only
    // appears AFTER a failed add, so gating on it can never work before the click. Backlog 10.4 —
    // an out-of-stock colour is a real, selectable radio now (`aria-disabled` is not used on it
    // per the spec), so this helper picks by the `data-out-of-stock` hook instead.
    {
      const colorRadios = colorGroup.getByRole("radio");
      const cCount = await colorRadios.count();
      for (let i = 0; i < cCount; i++) {
        const radio = colorRadios.nth(i);
        if ((await radio.getAttribute("data-out-of-stock")) !== "true") {
          await radio.click();
          break;
        }
      }
    }
  }
}

// Backlog 10.1/10.2/10.3 (owner's manual test findings, v2.4.0/v2.4.1). A real product with 6
// distinct colours already exists in the redesign DB (nk-7777), but no product in this DB
// snapshot has a populated per-colour `VariantImage` gallery — needed to prove the
// thumbnail-strip height cap with more than one thumbnail. This suite seeds exactly 6
// `VariantImage` rows for one of nk-7777's real, existing colours (never touching its existing
// variant/product rows) and deletes precisely those seeded rows afterward (by id) — never a
// bulk/pattern delete.
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
// nk-7777's "sky blue" colour already has its own distinct photo (no seeding needed) — used for
// the 10.2 hover/keyboard preview tests so they're independent of the seeded gallery above.
const HOVER_COLOR_NAME = "sky blue";
const HOVER_COLOR_IMAGE_FRAGMENT = "xiwrxjqselhf0oiw5atg";

// Backlog 10.4 — nk-7777's "boysenberry" colour, distinct from the gallery/hover colours above
// and with its own distinct photo (unlike "اسود", which has none), temporarily zeroed to 0
// partner stock for the test governorate (القاهرة) through the existing `PartnerInventory` rows
// (never a production row's stock left mutated — every row this test touches is restored to its
// original `stockAvailable` in a `finally` block, same pattern already used by
// `public-checkout.spec.ts`'s COD stock restoration).
const OUT_OF_STOCK_COLOR_NAME = "boysenberry";
const OUT_OF_STOCK_COLOR_KEY = "boysenberry|#873260";
const TEST_GOVERNORATE = "القاهرة";

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

      // If a colour is now required, pick the first in-stock one (backlog 10.4 — out-of-stock
      // colours are real, selectable radios, identified by `data-out-of-stock` not `aria-disabled`).
      if ((await colorGroup.count()) > 0) {
        const colorRadios = colorGroup.getByRole("radio");
        {
          const cCount = await colorRadios.count();
          for (let i = 0; i < cCount; i++) {
            const radio = colorRadios.nth(i);
            const outOfStock = await radio.getAttribute("data-out-of-stock");
            if (outOfStock !== "true") {
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

    // Backlog 10.3 — the visible magnifier is gone; the lightbox is reachable via a
    // visually-hidden control kept for keyboard/screen-reader users on desktop. Opens/closes
    // with Escape same as before.
    await page.getByRole("button", { name: "عرض الصورة كاملة" }).focus();
    await page.keyboard.press("Enter");
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

  test("backlog 10.3 — 5:4 main frame + price fit above the fold at every viewport, gallery proof screenshots", async ({
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
    // 5:4 landscape (supersedes 10.1's 4:5 portrait) at every viewport.
    expect(Math.abs(frameBox!.width / frameBox!.height - 1.25)).toBeLessThan(0.02);

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
    await page.screenshot({ path: "screenshots/pdp-10.3-1514x681.png" });

    // Selecting the seeded 6-photo colour swaps to its gallery: the thumbnail strip now has more
    // thumbnails than fit in the capped height and scrolls vertically instead of growing past it.
    // The thumbnail strip itself is unchanged by 10.3 (still 4:5, still capped/scrollable).
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
    await page.screenshot({ path: "screenshots/pdp-10.3-1514x681-scrollable-thumbnails.png" });

    for (const vp of GALLERY_VIEWPORTS.slice(1)) {
      await page.setViewportSize(vp);
      // The frame is sized by CSS alone; give any newly-requested images a moment to load.
      await page.waitForTimeout(200);
      await page.waitForLoadState("networkidle");
      const box = await frame.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(vp.height);
      expect(Math.abs(box!.width / box!.height - 1.25)).toBeLessThan(0.02);
      await expect(page.locator("h1")).toBeVisible();
      await page.screenshot({ path: `screenshots/pdp-10.3-${vp.width}x${vp.height}.png` });
    }
  });

  test("backlog 10.3 — desktop cursor-following 2x zoom, no layout change", async ({ page, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    await setStorefrontLocation(page, base);

    await page.setViewportSize({ width: 1514, height: 681 });
    await page.goto(`/products/${GALLERY_PRODUCT_SLUG}`);

    const frame = page.getByTestId("pdp-main-frame");
    await expect(frame).toBeVisible();
    const frameBoxBefore = await frame.boundingBox();
    expect(frameBoxBefore).not.toBeNull();
    const scrollWidthBefore = await page.evaluate(() => document.documentElement.scrollWidth);

    const zoomLayer = frame.locator("> div[aria-hidden='true']");

    // Rest — no zoom layer visible.
    await page.mouse.move(10, 10); // away from the frame first
    await expect(zoomLayer).toHaveCSS("opacity", "0");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "screenshots/pdp-10.3-zoom-rest-1514x681.png" });

    const box = frameBoxBefore!;

    // Cursor near the top-left corner of the frame reveals the collar (background-position near 0% 0%).
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.1);
    await expect(zoomLayer).toHaveCSS("opacity", "1");
    const posTopLeft = await zoomLayer.evaluate((el) => getComputedStyle(el).backgroundPosition);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "screenshots/pdp-10.3-zoom-top-left-1514x681.png" });

    // Cursor near the bottom-right corner reveals the hem (background-position near 100% 100%).
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.9);
    const posBottomRight = await zoomLayer.evaluate((el) => getComputedStyle(el).backgroundPosition);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "screenshots/pdp-10.3-zoom-bottom-right-1514x681.png" });

    expect(posBottomRight).not.toBe(posTopLeft);

    // No layout change: the frame's own box and the page's horizontal extent are unaffected.
    const frameBoxAfter = await frame.boundingBox();
    expect(frameBoxAfter).toEqual(frameBoxBefore);
    const scrollWidthAfter = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidthAfter).toBe(scrollWidthBefore);

    // Leaving the frame restores the plain (un-zoomed) crop.
    await page.mouse.move(10, 10);
    await expect(zoomLayer).toHaveCSS("opacity", "0");
  });

  test("backlog 10.3 — touch devices tap the frame to open the lightbox, no zoom", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ ...devices["iPhone 12"] });
    const page = await context.newPage();
    try {
      await setStorefrontLocation(page, baseURL ?? "http://localhost:3100");
      await page.goto(`/products/${GALLERY_PRODUCT_SLUG}`);

      const frame = page.getByTestId("pdp-main-frame");
      await expect(frame).toBeVisible();

      // No zoom layer ever becomes visible on a touch/coarse-pointer device.
      const zoomLayer = frame.locator("> div[aria-hidden='true']");
      await expect(zoomLayer).toHaveCSS("opacity", "0");

      await frame.tap();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(zoomLayer).toHaveCSS("opacity", "0");
    } finally {
      await context.close();
    }
  });

  test("backlog 10.2 — hovering/focusing a colour swatch previews its photo, restores on leave, click keeps it", async ({
    page,
    baseURL,
  }) => {
    const base = baseURL ?? "http://localhost:3100";
    await setStorefrontLocation(page, base);

    await page.setViewportSize({ width: 1514, height: 681 });
    await page.goto(`/products/${GALLERY_PRODUCT_SLUG}`);

    const mainImage = page.getByTestId("pdp-main-frame").locator("img");
    const restSrc = await mainImage.getAttribute("src");
    expect(restSrc).not.toContain(HOVER_COLOR_IMAGE_FRAGMENT);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "screenshots/pdp-10.2-rest-1514x681.png" });

    const swatch = page.getByRole("radio", { name: HOVER_COLOR_NAME });
    await expect(swatch).toHaveAttribute("aria-checked", "false");

    // Hover — previews, does not select.
    await swatch.hover();
    await expect(mainImage).toHaveAttribute("src", new RegExp(HOVER_COLOR_IMAGE_FRAGMENT), { timeout: 5_000 });
    await expect(swatch).toHaveAttribute("aria-checked", "false");
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "screenshots/pdp-10.2-hover-1514x681.png" });

    // Move away — restores, no sticky state.
    await page.locator("h1").hover();
    await expect(mainImage).not.toHaveAttribute("src", new RegExp(HOVER_COLOR_IMAGE_FRAGMENT), { timeout: 5_000 });
    const restoredSrc = await mainImage.getAttribute("src");
    expect(restoredSrc).toBe(restSrc);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: "screenshots/pdp-10.2-after-leave-1514x681.png" });

    // Click — selects, and the preview becomes the new selection (stays after the mouse leaves).
    await swatch.click();
    await expect(swatch).toHaveAttribute("aria-checked", "true");
    await expect(mainImage).toHaveAttribute("src", new RegExp(HOVER_COLOR_IMAGE_FRAGMENT));
    await page.locator("h1").hover();
    await expect(mainImage).toHaveAttribute("src", new RegExp(HOVER_COLOR_IMAGE_FRAGMENT));
  });

  test("backlog 10.2 — keyboard: focusing a swatch previews, blurring restores", async ({ page, baseURL }) => {
    const base = baseURL ?? "http://localhost:3100";
    await setStorefrontLocation(page, base);
    await page.setViewportSize({ width: 1514, height: 681 });
    await page.goto(`/products/${GALLERY_PRODUCT_SLUG}`);

    const mainImage = page.getByTestId("pdp-main-frame").locator("img");
    const restSrc = await mainImage.getAttribute("src");

    const swatch = page.getByRole("radio", { name: HOVER_COLOR_NAME });
    await swatch.focus();
    await expect(mainImage).toHaveAttribute("src", new RegExp(HOVER_COLOR_IMAGE_FRAGMENT), { timeout: 5_000 });
    await expect(swatch).toHaveAttribute("aria-checked", "false");

    await page.keyboard.press("Tab");
    await expect(mainImage).not.toHaveAttribute("src", new RegExp(HOVER_COLOR_IMAGE_FRAGMENT), { timeout: 5_000 });
    const restoredSrc = await mainImage.getAttribute("src");
    expect(restoredSrc).toBe(restSrc);
  });

  test.describe("backlog 10.4 — an out-of-stock colour can be previewed and selected, only buying is blocked", () => {
    test("hover previews it, click selects it, buttons disabled with the message, sizes struck through, add-to-cart impossible", async ({
      page,
      baseURL,
    }) => {
      const base = baseURL ?? "http://localhost:3100";

      const product = await prisma.product.findUnique({
        where: { slug: GALLERY_PRODUCT_SLUG },
        include: { variants: true },
      });
      if (!product) throw new Error(`Fixture product ${GALLERY_PRODUCT_SLUG} not found.`);
      const rule = await prisma.reroutingRule.findFirst({
        where: { governorate: TEST_GOVERNORATE, isActive: true },
        include: {
          partners: {
            where: { isActive: true, partner: { isActive: true } },
            orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
            include: { partner: { select: { id: true } } },
          },
        },
      });
      const partnerId = rule?.partners[0]?.partner.id;
      if (!partnerId) throw new Error(`No partner covers ${TEST_GOVERNORATE} in the redesign DB.`);

      const colorVariants = product.variants.filter((v) => `${v.colorName}|${v.colorHex}` === OUT_OF_STOCK_COLOR_KEY);
      const inventoryRows = await prisma.partnerInventory.findMany({
        where: { partnerId, variantId: { in: colorVariants.map((v) => v.id) } },
      });
      const originalStock = inventoryRows.map((row) => ({ id: row.id, stockAvailable: row.stockAvailable }));

      try {
        // Zero every existing row for this colour/partner — any size with no row at all is
        // already 0 stock for this governorate (`getPartnerStockOverrides` treats a missing
        // variantId as 0), so this alone makes the whole colour unavailable here.
        for (const row of inventoryRows) {
          await prisma.partnerInventory.update({ where: { id: row.id }, data: { stockAvailable: 0 } });
        }

        await setStorefrontLocation(page, base);
        await page.setViewportSize({ width: 1514, height: 681 });
        await page.goto(`/products/${GALLERY_PRODUCT_SLUG}`);

        const swatch = page.getByRole("radio", { name: new RegExp(`^${OUT_OF_STOCK_COLOR_NAME}`) });
        await expect(swatch).toBeVisible();
        // `aria-disabled` is not used on the swatch (backlog 10.4) — it's a real, reachable radio.
        await expect(swatch).not.toHaveAttribute("aria-disabled", "true");
        await expect(swatch).toHaveAttribute("data-out-of-stock", "true");
        // Screen readers hear the colour name plus "غير متوفر".
        await expect(swatch).toHaveAccessibleName(new RegExp(`${OUT_OF_STOCK_COLOR_NAME}.*غير متوفر`));

        const mainImage = page.getByTestId("pdp-main-frame").locator("img");

        // Establish a known baseline photo first (an in-stock colour distinct from the
        // out-of-stock one below), so the hover-preview assertion isn't at the mercy of the
        // out-of-stock colour's photo coincidentally matching the page's initial default photo.
        const hoverBaselineSwatch = page.getByRole("radio", { name: HOVER_COLOR_NAME });
        await hoverBaselineSwatch.click();
        const restSrc = await mainImage.getAttribute("src");

        // Hover previews it (10.2 behaviour extends to an out-of-stock colour).
        await swatch.hover();
        await expect(mainImage).not.toHaveAttribute("src", restSrc ?? "", { timeout: 5_000 });
        await expect(swatch).toHaveAttribute("aria-checked", "false");

        // Move away — restores, no sticky preview.
        await page.locator("h1").hover();
        await expect(mainImage).toHaveAttribute("src", restSrc ?? "", { timeout: 5_000 });

        // Click selects it.
        await swatch.click();
        await expect(swatch).toHaveAttribute("aria-checked", "true");

        const actions = page.getByTestId("pdp-actions");
        const addToCartButton = actions.getByRole("button", { name: "أضف إلى السلة" });
        const buyNowButton = actions.getByRole("button", { name: "اشتر الآن" });
        const message = page.getByText("هذا اللون غير متوفر حالياً");

        await expect(addToCartButton).toBeDisabled();
        await expect(buyNowButton).toBeDisabled();
        await expect(message).toBeVisible();
        const messageId = await message.getAttribute("id");
        expect(messageId).toBeTruthy();
        await expect(addToCartButton).toHaveAttribute("aria-describedby", messageId!);
        await expect(buyNowButton).toHaveAttribute("aria-describedby", messageId!);

        // Sizes struck through/disabled — stock is per governorate/colour, this colour has zero
        // stock in every size at the test partner even though other colours share the same
        // size labels and remain in stock.
        const sizeGroup = page.getByRole("radiogroup", { name: "المقاس" });
        const sizeRadios = sizeGroup.getByRole("radio");
        const sizeCount = await sizeRadios.count();
        expect(sizeCount).toBeGreaterThan(0);
        for (let i = 0; i < sizeCount; i++) {
          await expect(sizeRadios.nth(i)).toHaveAttribute("aria-disabled", "true");
        }

        // The quantity stepper is hidden or disabled — this PDP hides it entirely.
        await expect(page.getByRole("button", { name: "تقليل الكمية" })).toHaveCount(0);
        await expect(page.getByRole("button", { name: "زيادة الكمية" })).toHaveCount(0);

        // Add-to-cart via the page is impossible: the button is truly `disabled`, not just styled.
        await addToCartButton.click({ force: true });
        await expect(page.getByRole("dialog", { name: "سلة التسوق" })).not.toBeVisible();

        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: "screenshots/pdp-10.4-1514x681.png" });

        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForLoadState("networkidle");
        await page.screenshot({ path: "screenshots/pdp-10.4-390x844.png" });
      } finally {
        for (const row of originalStock) {
          await prisma.partnerInventory.update({ where: { id: row.id }, data: { stockAvailable: row.stockAvailable } });
        }
      }
    });
  });

  test.afterAll(async () => {
    if (seededVariantImageIds.length > 0) {
      await prisma.variantImage.deleteMany({ where: { id: { in: seededVariantImageIds } } });
    }
    await prisma.$disconnect();
  });
});
