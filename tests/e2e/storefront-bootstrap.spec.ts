import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { test, expect, type Page, type Request, type Route } from "@playwright/test";
import { safeWhere } from "./db-cleanup";

// Backlog 6.2 (One storefront bootstrap request) regression coverage. Read-only against the
// redesign DB (real active category/product slugs, never invented fixtures) — no writes for the
// happy-path tests, so `db-cleanup.ts`'s helpers don't apply there (same reasoning as
// `public-shell.spec.ts`); the logged-in-customer test below does seed/delete one fixture user
// through `safeWhere`.
//
// Exit criterion: on a fresh load of `/`, a category page and a product page, exactly one
// `/api/*` request is `/api/storefront/bootstrap`, and none of the four endpoints it replaced
// (`/api/auth/me`, `/api/storefront/governorate`, `/api/promotions/coupon-popup-messages`,
// `/api/cart`) fires on its own. Page-owned requests (`/api/products*`, `/api/analytics/view`,
// `/api/menu`, ...) are unrelated and allowed.
//
// Also covers the verifier's regression finding: a failed `/api/storefront/bootstrap` must never
// force `GovernorateSelector`'s address modal open with an empty options list and no way out —
// it must fall back to the component's own `/api/storefront/governorate` fetch, and only if that
// also fails does it degrade to a dismissable, non-empty "pick your location" prompt.

const prisma = new PrismaClient();

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

function fulfill500(route: Route) {
  return route.fulfill({
    status: 500,
    contentType: "application/json",
    body: JSON.stringify({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "forced failure (test)" },
    }),
  });
}

const REPLACED_ENDPOINTS = [
  "/api/auth/me",
  "/api/storefront/governorate",
  "/api/promotions/coupon-popup-messages",
  "/api/cart",
];

async function setStorefrontLocation(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([
    {
      name: "nile_storefront_location",
      value: encodeURIComponent(JSON.stringify({ governorate: "القاهرة", area: "مدينة نصر" })),
      url: baseURL ?? "http://localhost:3100",
    },
  ]);
}

function apiRequestsFrom(requests: Request[]): string[] {
  return requests
    .map((r) => {
      try {
        return new URL(r.url()).pathname + new URL(r.url()).search;
      } catch {
        return r.url();
      }
    })
    .filter((url) => url.includes("/api/"));
}

async function assertOneBootstrapRequest(page: Page, baseURL: string | undefined, path: string) {
  const requests: Request[] = [];
  page.on("request", (req) => requests.push(req));

  await setStorefrontLocation(page, baseURL);
  // Tie the wait to the actual signal (the bootstrap response) rather than relying solely on
  // `networkidle`, which can resolve before a slow first Turbopack compile finishes issuing its
  // client-side fetches when several pages compile concurrently across parallel workers.
  await Promise.all([
    page.waitForResponse((res) => res.url().includes("/api/storefront/bootstrap"), { timeout: 60_000 }),
    page.goto(path),
  ]);
  await page.waitForLoadState("networkidle");

  const apiUrls = apiRequestsFrom(requests);
  const bootstrapCalls = apiUrls.filter((u) => u.startsWith("/api/storefront/bootstrap"));
  expect(bootstrapCalls, `api calls seen on ${path}: ${apiUrls.join(", ")}`).toHaveLength(1);

  for (const replaced of REPLACED_ENDPOINTS) {
    const hit = apiUrls.some((u) => u.startsWith(replaced));
    expect(hit, `expected no call to ${replaced} on ${path}; api calls: ${apiUrls.join(", ")}`).toBe(
      false
    );
  }

  // The three chrome pieces the bootstrap feeds still render.
  await expect(page.getByRole("button", { name: "القاهرة" })).toBeVisible();
  const nav = page.getByRole("banner");
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "سلة التسوق" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "حسابي" })).toBeVisible();
}

test.describe("storefront bootstrap — one request replaces four (backlog 6.2)", () => {
  let categorySlug: string;
  let productSlug: string;

  test.beforeAll(async () => {
    const category = await prisma.category.findFirst({
      where: { products: { some: { active: true } } },
      select: { slug: true },
      orderBy: { sortOrder: "asc" },
    });
    if (!category) throw new Error("No category with an active product available in the redesign DB.");
    categorySlug = category.slug;

    const product = await prisma.product.findFirst({
      where: { active: true },
      select: { slug: true },
      orderBy: { sortOrder: "asc" },
    });
    if (!product) throw new Error("No active product available in the redesign DB.");
    productSlug = product.slug;
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("home (/) fires exactly one bootstrap request, no separate governorate/coupon/auth/cart calls", async ({
    page,
    baseURL,
  }) => {
    await assertOneBootstrapRequest(page, baseURL, "/");
  });

  test("category page fires exactly one bootstrap request", async ({ page, baseURL }) => {
    await assertOneBootstrapRequest(page, baseURL, `/categories/${categorySlug}`);
  });

  test("product page fires exactly one bootstrap request", async ({ page, baseURL }) => {
    await assertOneBootstrapRequest(page, baseURL, `/products/${productSlug}`);
  });
});

test.describe("bootstrap failure — the guest must never be locked out (verifier finding)", () => {
  test("bootstrap 500s: page stays usable, no modal forced open, cart falls back to /api/cart, navbar shows guest", async ({
    page,
    baseURL,
  }) => {
    const requests: Request[] = [];
    page.on("request", (req) => requests.push(req));

    // A real saved address so the component's own `/api/storefront/governorate` fallback (the
    // real endpoint — not mocked here) resolves an address, keeping the pill in its normal state.
    await setStorefrontLocation(page, baseURL);
    await page.route("**/api/storefront/bootstrap", fulfill500);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const apiUrls = apiRequestsFrom(requests);
    expect(apiUrls.some((u) => u.startsWith("/api/storefront/bootstrap"))).toBe(true);
    // Governorate falls back to its own endpoint and gets a real answer — no forced-open modal.
    expect(apiUrls.some((u) => u.startsWith("/api/storefront/governorate"))).toBe(true);
    await expect(page.getByRole("heading", { name: "عنوان التوصيل" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "القاهرة" })).toBeVisible();

    // Cart falls back to its own endpoint too (same pattern).
    expect(apiUrls.some((u) => u.startsWith("/api/cart"))).toBe(true);

    // Navbar degrades to the guest state rather than firing its own `/api/auth/me` — the
    // account-menu source of truth is the bootstrap alone.
    const nav = page.getByRole("banner");
    await expect(nav.getByRole("link", { name: "حسابي" })).toBeVisible();
    expect(apiUrls.some((u) => u.startsWith("/api/auth/me"))).toBe(false);

    // The page itself is genuinely usable, not just "not crashed".
    await expect(nav).toBeVisible();
    await expect(nav.getByRole("link", { name: /قطن ملوك النيل/ })).toBeVisible();
  });

  test("bootstrap and governorate both 500: no modal forced open; opening it by hand shows a non-empty list", async ({
    page,
    baseURL,
  }) => {
    const requests: Request[] = [];
    page.on("request", (req) => requests.push(req));

    await page.route("**/api/storefront/bootstrap", fulfill500);
    await page.route("**/api/storefront/governorate", fulfill500);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // No modal forced open, and the page is still usable.
    await expect(page.getByRole("heading", { name: "عنوان التوصيل" })).toHaveCount(0);
    await expect(page.getByRole("banner")).toBeVisible();

    // The pill is still there, in its "pick your location" prompt state, so the guest can open
    // the modal by hand whenever they want.
    const pill = page.getByRole("button", { name: "اختر محافظتك" });
    await expect(pill).toBeVisible();
    await pill.click();

    // Opened by hand: a real, non-empty governorate list (the static fallback), not an empty one.
    await expect(page.getByRole("heading", { name: "عنوان التوصيل" })).toBeVisible();
    const select = page.locator("select");
    await expect(select).toBeVisible();
    const optionCount = await select.locator("option").count();
    expect(optionCount).toBeGreaterThan(1); // placeholder + at least one real governorate

    // Dismissable: Escape closes it without navigating away.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "عنوان التوصيل" })).toHaveCount(0);
    await expect(pill).toBeVisible();
  });
});

test.describe("logged-in customer — the bootstrap carries the user, no separate /api/auth/me", () => {
  const FIXTURE_PHONE = "+201099955494";
  const FIXTURE_PASSWORD = "BootstrapUserTest123!";
  const FIXTURE_NAME = "منى علي";
  let fixtureUserId: string;

  test("navbar shows the logged-in customer's name from the bootstrap, with no /api/auth/me call", async ({
    page,
    baseURL,
  }) => {
    const passwordHash = await hashPassword(FIXTURE_PASSWORD);
    const user = await prisma.user.upsert({
      where: { phone: FIXTURE_PHONE },
      create: { phone: FIXTURE_PHONE, role: "CUSTOMER", passwordHash, name: FIXTURE_NAME },
      update: { passwordHash, role: "CUSTOMER", name: FIXTURE_NAME },
    });
    fixtureUserId = user.id;

    try {
      await setStorefrontLocation(page, baseURL);
      await page.goto("/login");
      await page.getByLabel("رقم الهاتف").fill(FIXTURE_PHONE.replace("+20", ""));
      await page.getByLabel("كلمة المرور").fill(FIXTURE_PASSWORD);

      const requests: Request[] = [];
      page.on("request", (req) => requests.push(req));

      await page.getByRole("button", { name: "تسجيل الدخول" }).click();
      await expect(page).toHaveURL("/", { timeout: 15000 });
      await page.waitForLoadState("networkidle");

      const apiUrls = apiRequestsFrom(requests);
      expect(apiUrls.some((u) => u.startsWith("/api/storefront/bootstrap"))).toBe(true);
      expect(apiUrls.some((u) => u.startsWith("/api/auth/me"))).toBe(false);

      const accountButton = page.getByRole("button", { name: "حسابي" });
      await expect(accountButton).toContainText("منى");
    } finally {
      await prisma.user.delete({ where: safeWhere({ id: fixtureUserId }) }).catch(() => {});
    }
  });
});
