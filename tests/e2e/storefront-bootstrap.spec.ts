import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { test, expect, type Page, type Request } from "@playwright/test";

// Backlog 6.2 (One storefront bootstrap request) regression coverage. Read-only against the
// redesign DB (real active category/product slugs, never invented fixtures) — no writes, so
// `db-cleanup.ts`'s helpers don't apply here (same reasoning as `public-shell.spec.ts`).
//
// Exit criterion: on a fresh load of `/`, a category page and a product page, exactly one
// `/api/*` request is `/api/storefront/bootstrap`, and none of the four endpoints it replaced
// (`/api/auth/me`, `/api/storefront/governorate`, `/api/promotions/coupon-popup-messages`,
// `/api/cart`) fires on its own. Page-owned requests (`/api/products*`, `/api/analytics/view`,
// `/api/menu`, ...) are unrelated and allowed.

const prisma = new PrismaClient();

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
