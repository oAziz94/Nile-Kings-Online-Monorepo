import { test, expect, type Page, type Route } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { safeWhere } from "./db-cleanup";

// Backlog 6.7 — GA4 on the storefront. This spec must run against a hand-started server with
// `NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-TEST123` set (Playwright's own `webServer` never sets it —
// see `playwright.config.ts`'s `reuseExistingServer`), e.g.:
//
//   NEXT_PUBLIC_GA4_MEASUREMENT_ID=G-TEST123 npm run dev:redesign -- --port 3166
//   PLAYWRIGHT_PORT=3166 npx playwright test tests/e2e/ga4.spec.ts
//
// Both `googletagmanager.com` and `google-analytics.com` are routed to an empty 200 response in
// every test so nothing ever actually leaves the machine — the real script never runs, so the
// storefront's own `gtag`/`dataLayer` shim (defined by `<Ga4 />`'s inline init script) is what we
// read back: `window.dataLayer` accumulates one array per `gtag(...)` call, which is exactly the
// event log we assert against.

const prisma = new PrismaClient();
const FIXTURE_PHONE = "+201099977701";
const FIXTURE_PASSWORD = "Ga4CheckoutTest123!";
const GOVERNORATE = "القاهرة";

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scryptAsync(plain, salt);
  return `${salt}:${key.toString("hex")}`;
}

/** A cookieless fetch sees every product as out of stock (per-partner stock is resolved from
 *  this cookie) — same setup every other public-* spec does before reading product APIs. */
async function setStorefrontLocation(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([
    {
      name: "nile_storefront_location",
      value: encodeURIComponent(JSON.stringify({ governorate: GOVERNORATE, area: "مدينة نصر" })),
      url: baseURL ?? "http://localhost:3100",
    },
  ]);
}

async function stubGa4Network(page: Page) {
  const emptyScript = (route: Route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: "" });
  await page.route("**/googletagmanager.com/**", emptyScript);
  await page.route("**/google-analytics.com/**", emptyScript);
}

/** `gtag()`'s shim (defined by `<Ga4 />`) pushes `arguments` objects into `window.dataLayer`;
 *  read them back as plain arrays and keep only the `event`-shaped ones. */
async function readGa4Events(page: Page): Promise<{ name: string; params: Record<string, unknown> }[]> {
  const raw = await page.evaluate(() =>
    (window.dataLayer ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>))
  );
  return raw
    .filter((entry) => entry[0] === "event")
    .map((entry) => ({ name: entry[1] as string, params: (entry[2] as Record<string, unknown>) ?? {} }));
}

type ApiVariant = { id: string; sku: string; stockAvailable: number };
type ApiProduct = { name: string; slug: string; variants: ApiVariant[] };

/**
 * Finds a product card link on the home page whose product actually has stock — never a
 * hardcoded slug, same discipline as the other public-* specs. Product cards link to a
 * *variant* slug (`productSlug_size_colorHex`, see `components/shared/product-card.tsx`), but
 * `GET /api/products/[slug]` only resolves the base *product* slug (the PDP's own server
 * component resolves both, this API route does not) — so this cross-references the home page's
 * hrefs against the real, in-stock product slugs from `/api/products?inStock=true` by prefix.
 */
async function findClientNavStockedProductLink(
  page: Page
): Promise<{ index: number; slug: string; sku: string; name: string }> {
  const listRes = await page.request.get("/api/products?inStock=true&limit=60");
  expect(listRes.ok()).toBeTruthy();
  const candidates = ((await listRes.json()).data?.products ?? []) as { slug: string }[];

  const links = page.locator('a[href^="/products/"]');
  const count = await links.count();
  for (let i = 0; i < count; i++) {
    const href = await links.nth(i).getAttribute("href");
    if (!href) continue;
    const hrefSlug = href.replace("/products/", "");
    const productSlug = candidates.find((c) => hrefSlug === c.slug || hrefSlug.startsWith(`${c.slug}_`))?.slug;
    if (!productSlug) continue;
    const res = await page.request.get(`/api/products/${encodeURIComponent(productSlug)}`);
    if (!res.ok()) continue;
    const product = ((await res.json()).data ?? null) as ApiProduct | null;
    const stocked = product?.variants.find((v) => v.stockAvailable >= 1);
    if (product && stocked) return { index: i, slug: productSlug, sku: stocked.sku, name: product.name };
  }
  throw new Error("No in-stock product card found on the home page for this test.");
}

/** Mirrors public-pdp.spec.ts's helper: picks an in-stock size/colour so "أضف إلى السلة" works. */
async function resolveVariant(page: Page) {
  const sizeGroup = page.getByRole("radiogroup", { name: "المقاس" });
  const colorGroup = page.getByRole("radiogroup", { name: "اللون" });
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
  if ((await colorGroup.count()) > 0) {
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

/** A real in-stock product slug, resolved directly from the listing API — never hardcoded. */
async function findInStockProductSlug(page: Page): Promise<{ slug: string; name: string }> {
  const listRes = await page.request.get("/api/products?inStock=true&limit=48");
  expect(listRes.ok()).toBeTruthy();
  const products = ((await listRes.json()).data?.products ?? []) as { slug: string; name: string }[];
  for (const p of products) {
    const res = await page.request.get(`/api/products/${encodeURIComponent(p.slug)}`);
    if (!res.ok()) continue;
    const detail = ((await res.json()).data ?? null) as ApiProduct | null;
    if (detail?.variants.some((v) => v.stockAvailable > 0)) return { slug: p.slug, name: p.name };
  }
  throw new Error("No in-stock product available in the redesign DB for this test.");
}

test.describe.configure({ mode: "serial" });

// Verifier finding (2026-09-19): `view_item`/`page_view` must fire on a *cold* first load of a
// page too — a shopper arriving from Google, an ad, a shared link, or a plain refresh never goes
// through a prior client-side navigation where `gtag.js` had time to load first. These use a
// fresh `page.goto()` per test (no earlier navigation in the same page), so they'd have failed
// against the old `typeof window.gtag === "function"` gate in `trackEvent`.
test.describe("GA4 — cold loads (page.goto straight onto the page, no prior client navigation)", () => {
  test("a cold load of / fires page_view for /", async ({ page, baseURL }) => {
    await stubGa4Network(page);
    await setStorefrontLocation(page, baseURL);
    await page.goto("/");
    await expect(page.getByRole("banner")).toBeVisible();
    await expect
      .poll(async () => (await readGa4Events(page)).some((e) => e.name === "page_view" && e.params.page_path === "/"))
      .toBe(true);
  });

  test("a cold load of a PDP fires page_view for that path and view_item with the item payload", async ({
    page,
    baseURL,
  }) => {
    await stubGa4Network(page);
    await setStorefrontLocation(page, baseURL);
    const { slug, name } = await findInStockProductSlug(page);

    await page.goto(`/products/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

    await expect
      .poll(async () =>
        (await readGa4Events(page)).some(
          (e) => e.name === "page_view" && typeof e.params.page_path === "string" && (e.params.page_path as string).startsWith(`/products/${slug}`)
        )
      )
      .toBe(true);

    const viewItem = (await readGa4Events(page)).find((e) => e.name === "view_item");
    expect(viewItem, "expected view_item on a cold PDP load").toBeTruthy();
    const items = viewItem!.params.items as { item_id: string; item_name: string }[];
    expect(items[0].item_id).toBeTruthy();
    expect(items[0].item_name).toBe(name);
  });
});

test.describe("GA4 — page_view, view_item, add_to_cart on a home -> PDP -> add-to-cart walk", () => {
  test("home fires page_view; a client navigation to the PDP fires a second page_view + view_item; adding to cart fires add_to_cart", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(60_000);
    await stubGa4Network(page);
    await setStorefrontLocation(page, baseURL);

    await page.goto("/");
    await expect(page.getByRole("banner")).toBeVisible();

    await expect
      .poll(async () => (await readGa4Events(page)).some((e) => e.name === "page_view" && e.params.page_path === "/"))
      .toBe(true);

    const { index, slug, sku, name } = await findClientNavStockedProductLink(page);
    const eventsBeforeNav = (await readGa4Events(page)).length;

    // A real click on the product card's own <Link> — a client-side navigation, not page.goto().
    await page.locator('a[href^="/products/"]').nth(index).click();
    await expect(page).toHaveURL(new RegExp(`/products/${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

    await expect
      .poll(async () => (await readGa4Events(page)).length)
      .toBeGreaterThan(eventsBeforeNav);

    const eventsOnPdp = await readGa4Events(page);
    const secondPageView = eventsOnPdp.find(
      (e) => e.name === "page_view" && typeof e.params.page_path === "string" && (e.params.page_path as string).startsWith("/products/")
    );
    expect(secondPageView, "expected a second page_view for the client navigation to the PDP").toBeTruthy();

    const viewItem = eventsOnPdp.find((e) => e.name === "view_item");
    expect(viewItem, "expected a view_item event on the PDP").toBeTruthy();
    const viewItemItems = viewItem!.params.items as { item_id: string; item_name: string }[];
    expect(viewItemItems[0].item_id).toBeTruthy();
    expect(viewItemItems[0].item_name).toBe(name);

    // Add to cart.
    await resolveVariant(page);
    await page.getByTestId("pdp-actions").getByRole("button", { name: "أضف إلى السلة" }).click();
    await expect
      .poll(async () => (await readGa4Events(page)).some((e) => e.name === "add_to_cart"))
      .toBe(true);

    const addToCart = (await readGa4Events(page)).find((e) => e.name === "add_to_cart")!;
    const addedItems = addToCart.params.items as { item_id: string; quantity: number }[];
    expect(addedItems).toHaveLength(1);
    expect(addedItems[0].quantity).toBe(1);
    // The exact SKU depends on which size/colour resolveVariant picked, which may differ from
    // the representative variant `findClientNavStockedProductLink` resolved — assert it's a real,
    // non-empty SKU string rather than the specific one found up-front.
    expect(typeof addedItems[0].item_id).toBe("string");
    expect(addedItems[0].item_id.length).toBeGreaterThan(0);
    void sku;

    // Clean up the cart line so this spec is re-runnable and doesn't leave guest-session state.
    const cartRes = await page.request.get("/api/cart");
    if (cartRes.ok()) {
      const cart = (await cartRes.json()).data as { items: { id: string }[] } | undefined;
      for (const item of cart?.items ?? []) {
        await page.request.delete(`/api/cart/items/${item.id}`);
      }
    }
  });
});

/**
 * A successful governorate save fires `select_governorate` then immediately calls
 * `window.location.reload()` — same document, so the in-memory `dataLayer` (and any live
 * `page.evaluate` mid-flight) is gone before a normal read could ever observe it. Mirrors
 * every `gtag()` push into `sessionStorage` too (`addInitScript` re-installs this on every
 * navigation, including the reload itself, seeding from whatever was already stored), so this
 * one test can read the pre-reload event back out on the other side of it.
 */
async function installGa4SessionCapture(page: Page) {
  await page.addInitScript(() => {
    const KEY = "__ga4_test_events__";
    let stored: unknown[] = [];
    try {
      stored = JSON.parse(sessionStorage.getItem(KEY) ?? "[]");
    } catch {
      stored = [];
    }
    const nativePush = Array.prototype.push;
    (stored as unknown[] & { push: typeof nativePush }).push = function (...args: unknown[]) {
      const result = nativePush.apply(this, args as never[]);
      try {
        sessionStorage.setItem(KEY, JSON.stringify(this));
      } catch {
        /* sessionStorage unavailable */
      }
      return result;
    };
    window.dataLayer = stored;
  });
}

async function readSessionCapturedGa4Events(
  page: Page
): Promise<{ name: string; params: Record<string, unknown> }[]> {
  // Tolerates being called mid-reload (the reload this test's save triggers) — a destroyed
  // execution context just means "not ready yet", not a real failure; the poll loop retries.
  const raw = await page
    .evaluate(() => {
      try {
        return JSON.parse(sessionStorage.getItem("__ga4_test_events__") ?? "[]");
      } catch {
        return [];
      }
    })
    .catch(() => []);
  return (raw as Record<string, unknown>[])
    .map((entry) => Object.values(entry))
    .filter((entry) => entry[0] === "event")
    .map((entry) => ({ name: entry[1] as string, params: (entry[2] as Record<string, unknown>) ?? {} }));
}

test.describe("GA4 — select_governorate", () => {
  test("saving a governorate through the pill fires select_governorate", async ({ page }) => {
    test.setTimeout(60_000);
    await stubGa4Network(page);
    await installGa4SessionCapture(page);

    await page.goto("/");
    // A first-time guest (no saved address yet) gets the modal force-opened; anyone else needs
    // to open it via the pill — same "either state" handling as public-checkout.spec.ts's
    // `openNewAddressForm`.
    const heading = page.getByRole("heading", { name: "عنوان التوصيل" });
    const pill = page.getByRole("button", { name: /اختر محافظتك|القاهرة|الإسكندرية/ });
    await expect(heading.or(pill)).toBeVisible({ timeout: 15_000 });
    if (await pill.isVisible().catch(() => false)) {
      await pill.click();
    }
    await expect(heading).toBeVisible();
    // `GovernorateSelector`'s labels are plain text, not `htmlFor`-linked (pre-existing, backlog
    // N13) — locate the area input by its placeholder instead of `getByLabel`.
    await page.locator("select").selectOption(GOVERNORATE);
    await page.getByPlaceholder("مثال: الدقي").fill("مدينة نصر");

    const saveButton = page.getByRole("button", { name: "حفظ العنوان" });
    await expect(saveButton).toBeEnabled({ timeout: 5000 });
    await saveButton.click();

    // The save reloads the page on success — poll through the reload itself (the read helper
    // tolerates the transient destroyed-context error) and read the event back from
    // `sessionStorage`, which survived it (see `installGa4SessionCapture`).
    await expect
      .poll(async () => (await readSessionCapturedGa4Events(page)).some((e) => e.name === "select_governorate"), {
        timeout: 20_000,
      })
      .toBe(true);
    const event = (await readSessionCapturedGa4Events(page)).find((e) => e.name === "select_governorate")!;
    expect(event.params.governorate).toBe(GOVERNORATE);
  });
});

test.describe("GA4 — begin_checkout", () => {
  test.beforeAll(async () => {
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    const user = await prisma.user.upsert({
      where: { phone: FIXTURE_PHONE },
      create: { phone: FIXTURE_PHONE, role: "CUSTOMER", passwordHash },
      update: { passwordHash },
    });
    await prisma.savedAddress.deleteMany({ where: safeWhere({ userId: user.id }) });
  });

  test.afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { phone: FIXTURE_PHONE } });
    if (user) await prisma.savedAddress.deleteMany({ where: safeWhere({ userId: user.id }) });
    await prisma.$disconnect();
  });

  test("checkout page fires begin_checkout with the cart's items", async ({ page }) => {
    test.setTimeout(60_000);
    await stubGa4Network(page);

    const loginRes = await page.request.post("/api/auth/login", {
      data: { phone: FIXTURE_PHONE, password: FIXTURE_PASSWORD },
    });
    expect(loginRes.ok()).toBeTruthy();
    const govRes = await page.request.post("/api/storefront/governorate", {
      data: { governorate: GOVERNORATE },
    });
    expect(govRes.ok()).toBeTruthy();

    const listRes = await page.request.get("/api/products?inStock=true&limit=60");
    const list = (await listRes.json()).data.products as { slug: string }[];
    let variantId: string | null = null;
    for (const { slug } of list) {
      const res = await page.request.get(`/api/products/${slug}`);
      if (!res.ok()) continue;
      const product = (await res.json()).data as ApiProduct;
      const stocked = product.variants.find((v) => v.stockAvailable >= 1);
      if (stocked) {
        variantId = stocked.id;
        break;
      }
    }
    expect(variantId).toBeTruthy();

    const existingCart = await page.request.get("/api/cart");
    if (existingCart.ok()) {
      const existing = (await existingCart.json()).data as { items: { id: string }[] } | undefined;
      for (const item of existing?.items ?? []) {
        await page.request.delete(`/api/cart/items/${item.id}`);
      }
    }
    const addRes = await page.request.post("/api/cart/items", { data: { variantId, quantity: 1 } });
    expect(addRes.ok()).toBeTruthy();

    await page.goto("/checkout");
    await expect(page.getByRole("heading", { name: "عنوان التوصيل" })).toBeVisible();

    await expect
      .poll(async () => (await readGa4Events(page)).some((e) => e.name === "begin_checkout"))
      .toBe(true);
    const event = (await readGa4Events(page)).find((e) => e.name === "begin_checkout")!;
    expect((event.params.items as unknown[]).length).toBeGreaterThan(0);
    expect(event.params.currency).toBe("EGP");

    // Clean up the cart line.
    const cartRes = await page.request.get("/api/cart");
    if (cartRes.ok()) {
      const cart = (await cartRes.json()).data as { items: { id: string }[] } | undefined;
      for (const item of cart?.items ?? []) {
        await page.request.delete(`/api/cart/items/${item.id}`);
      }
    }
  });
});

test.describe("GA4 — never on /admin or /partner", () => {
  test("/admin loads no googletagmanager request and defines no window.gtag", async ({ page }) => {
    const gtmRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("googletagmanager.com")) gtmRequests.push(req.url());
    });
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    expect(gtmRequests).toHaveLength(0);
    const hasGtag = await page.evaluate(() => typeof (window as any).gtag === "function");
    expect(hasGtag).toBe(false);
  });

  test("/partner loads no googletagmanager request and defines no window.gtag", async ({ page }) => {
    const gtmRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("googletagmanager.com")) gtmRequests.push(req.url());
    });
    await page.goto("/partner");
    await page.waitForLoadState("networkidle");
    expect(gtmRequests).toHaveLength(0);
    const hasGtag = await page.evaluate(() => typeof (window as any).gtag === "function");
    expect(hasGtag).toBe(false);
  });
});
