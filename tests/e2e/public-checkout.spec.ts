import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { safeWhere } from "./db-cleanup";

// Backlog 4.12 (Checkout) regression coverage. This is the highest-risk storefront screen
// (revenue-adjacent), so — unlike the other public-* specs — this file seeds a real fixture user
// (same pattern as tests/e2e/auth-login.spec.ts, under test-env.ts's production guard) and places
// a real COD order against the live `/api/checkout/*` routes, then walks the money to the piastre
// against a direct `POST /api/checkout/summary` call and the placed order's `GET
// /api/profile/orders` record. The order + its stock decrement are cleaned up afterward so the
// shared redesign-branch catalog isn't drained by repeated runs.
//
// Fixtures are resolved at run time from the live product API (never hardcoded), same pattern as
// tests/e2e/public-cart.spec.ts's `findStockedVariant`.

const prisma = new PrismaClient();
const GOVERNORATE = "القاهرة";
const FIXTURE_PHONE = "+201099912345";
const FIXTURE_PASSWORD = "CheckoutTest123!";

const TEST_ADDRESS = {
  label: "",
  governorate: GOVERNORATE,
  city: "مدينة نصر",
  area: "الحي السابع",
  street: "شارع 90",
  phone: "01099912345",
};

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

type ApiVariant = {
  id: string;
  name: string;
  colorName: string | null;
  stockAvailable: number;
  priceEgp: number;
};
type ApiProduct = {
  id: string;
  name: string;
  slug: string;
  categorySlug: string;
  variants: ApiVariant[];
};

/** Same resolution strategy as public-cart.spec.ts's findStockedVariant — never a hardcoded SKU. */
async function findStockedVariant(page: Page): Promise<{ product: ApiProduct; variant: ApiVariant }> {
  const listRes = await page.request.get("/api/products?inStock=true&limit=60");
  expect(listRes.ok()).toBeTruthy();
  const list = (await listRes.json()).data.products as { slug: string }[];
  for (const { slug } of list) {
    const res = await page.request.get(`/api/products/${slug}`);
    if (!res.ok()) continue;
    const product = (await res.json()).data as ApiProduct;
    for (const variant of product.variants) {
      if (variant.stockAvailable >= 1) return { product, variant };
    }
  }
  throw new Error("No stocked variant found on the redesign branch for this test.");
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  const user = await prisma.user.upsert({
    where: { phone: FIXTURE_PHONE },
    create: { phone: FIXTURE_PHONE, role: "CUSTOMER", passwordHash },
    update: { passwordHash },
  });
  // Deterministic starting state for a re-runnable fixture: no leftover saved address from a
  // previous run (the checkout page shows the saved-address list instead of the new-address form
  // once one exists, which this spec's flow does not drive).
  await prisma.savedAddress.deleteMany({ where: safeWhere({ userId: user.id }) });
});

/** Opens the new-address form regardless of whether a saved address already exists for this user. */
async function openNewAddressForm(page: Page) {
  const governorateField = page.getByLabel("المحافظة *");
  const addNewButton = page.getByRole("button", { name: /إضافة عنوان (جديد|التوصيل)/ });
  // Wait out the "جاري تحميل العناوين المحفوظة…" skeleton before deciding which state we're in.
  await expect(governorateField.or(addNewButton)).toBeVisible({ timeout: 10_000 });
  if (await addNewButton.isVisible().catch(() => false)) {
    await addNewButton.click();
  }
  await expect(governorateField).toBeVisible();
}

test.afterAll(async () => {
  // The COD test's new-address auto-save (checkout.md's documented side effect) leaves a
  // `SavedAddress` row behind — clean it up so the fixture user starts fresh next run too.
  const user = await prisma.user.findUnique({ where: { phone: FIXTURE_PHONE } });
  if (user) await prisma.savedAddress.deleteMany({ where: safeWhere({ userId: user.id }) });
  await prisma.$disconnect();
});

async function loginFixtureUser(page: Page) {
  const res = await page.request.post("/api/auth/login", {
    data: { phone: FIXTURE_PHONE, password: FIXTURE_PASSWORD },
  });
  expect(res.ok()).toBeTruthy();
}

async function setGovernorate(page: Page) {
  const res = await page.request.post("/api/storefront/governorate", {
    data: { governorate: GOVERNORATE },
  });
  expect(res.ok()).toBeTruthy();
}

test.describe("Checkout — access gating", () => {
  test("a signed-out visitor is redirected to /login?redirect=/checkout", async ({ page }) => {
    await page.goto("/checkout");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fcheckout|\/login\?redirect=\/checkout/);
  });
});

test.describe("Checkout — COD order placement (money walk)", () => {
  test("summary math, order review, and the placed order's total all agree with the server", async ({ page }) => {
    // The full COD flow (real place-order transaction + routing) genuinely takes longer than
    // Playwright's 30s default in this dev environment.
    test.setTimeout(60_000);
    await loginFixtureUser(page);
    await setGovernorate(page);

    const { product, variant } = await findStockedVariant(page);

    // Empty any pre-existing cart from a previous failed run, then add exactly one unit.
    const existingCart = await page.request.get("/api/cart");
    if (existingCart.ok()) {
      const existing = (await existingCart.json()).data as { items: { id: string }[] } | undefined;
      for (const item of existing?.items ?? []) {
        await page.request.delete(`/api/cart/items/${item.id}`);
      }
    }
    const addRes = await page.request.post("/api/cart/items", {
      data: { variantId: variant.id, quantity: 1 },
    });
    expect(addRes.ok()).toBeTruthy();

    // Direct server truth for this exact address/payment method, computed independently of the UI.
    const summaryRes = await page.request.post("/api/checkout/summary", {
      data: {
        address: {
          governorate: TEST_ADDRESS.governorate,
          city: TEST_ADDRESS.city,
          area: TEST_ADDRESS.area,
          street: TEST_ADDRESS.street,
          phone: TEST_ADDRESS.phone,
        },
        couponCode: null,
        paymentMethod: "COD",
      },
    });
    expect(summaryRes.ok()).toBeTruthy();
    const expectedSummary = (await summaryRes.json()).data as {
      subtotal: number;
      shippingFee: number;
      codFee: number;
      finalTotal: number;
    };
    const expectedTotalEgp = Math.round(expectedSummary.finalTotal / 100);
    const expectedShippingEgp = Math.round((expectedSummary.shippingFee + expectedSummary.codFee) / 100);

    await page.goto("/checkout");

    await expect(page.getByRole("heading", { name: "عنوان التوصيل" })).toBeVisible();
    await openNewAddressForm(page);
    await page.getByLabel("المحافظة *").selectOption(TEST_ADDRESS.governorate);
    await page.getByLabel("المدينة *").fill(TEST_ADDRESS.city);
    await page.getByLabel("هاتف التوصيل *").fill(TEST_ADDRESS.phone);
    await page.getByLabel("المنطقة *").fill(TEST_ADDRESS.area);
    await page.getByLabel("العنوان بالتفصيل *").fill(TEST_ADDRESS.street);

    // Order review shows the line we just added (all lines, not a first-6 cutoff).
    await expect(page.getByRole("heading", { name: "مراجعة الطلب" })).toBeVisible();
    await expect(page.getByText(product.name).first()).toBeVisible();

    // Summary aside settles on the server-computed total (500ms-debounced fetch).
    const summaryAside = page.locator("aside", { hasText: "ملخص الطلب" });
    await expect(summaryAside.getByText(`${expectedTotalEgp.toLocaleString("en-US")}`, { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    await expect(summaryAside.getByText(`${expectedShippingEgp.toLocaleString("en-US")}`, { exact: false })).toBeVisible();

    // COD is the default-selected payment method.
    await expect(page.getByRole("radio", { name: "الدفع عند الاستلام" })).toBeChecked();

    const confirmButton = page.getByRole("button", { name: "تأكيد الطلب" });
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect(page.getByText("تم إنشاء الطلب بنجاح").first()).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/\/profile\/orders$/, { timeout: 10_000 });

    // Server-side truth: the placed order's total matches the summary exactly, to the piastre.
    const ordersRes = await page.request.get("/api/profile/orders");
    expect(ordersRes.ok()).toBeTruthy();
    const orders = (await ordersRes.json()).data as { id: string; totalPiastres: number }[];
    expect(orders.length).toBeGreaterThan(0);
    const placedOrder = orders[0];
    expect(placedOrder.totalPiastres).toBe(expectedSummary.finalTotal);

    // Cleanup: delete the order (cascades OrderItem/PaymentAttempt/RoutedOrder) and restore the
    // partner stock this COD order committed, so repeated runs don't drain shared catalog stock.
    const fullOrder = await prisma.order.findUnique({
      where: { id: placedOrder.id },
      include: { items: true },
    });
    if (fullOrder?.assignedPartnerId) {
      for (const item of fullOrder.items) {
        await prisma.partnerInventory.updateMany({
          where: safeWhere({ partnerId: fullOrder.assignedPartnerId, variantId: item.variantId }),
          data: { stockAvailable: { increment: item.quantity } },
        });
      }
    }
    await prisma.order.delete({ where: safeWhere({ id: placedOrder.id }) });
  });
});

test.describe("Checkout — InstaPay instructions modal", () => {
  test("opens the instructions modal without placing an order, up to (not including) confirm", async ({ page }) => {
    test.setTimeout(60_000);
    await loginFixtureUser(page);
    await setGovernorate(page);

    const { variant } = await findStockedVariant(page);
    const existingCart = await page.request.get("/api/cart");
    if (existingCart.ok()) {
      const existing = (await existingCart.json()).data as { items: { id: string }[] } | undefined;
      for (const item of existing?.items ?? []) {
        await page.request.delete(`/api/cart/items/${item.id}`);
      }
    }
    await page.request.post("/api/cart/items", { data: { variantId: variant.id, quantity: 1 } });

    await page.goto("/checkout");
    await openNewAddressForm(page);
    await page.getByLabel("المحافظة *").selectOption(TEST_ADDRESS.governorate);
    await page.getByLabel("المدينة *").fill(TEST_ADDRESS.city);
    await page.getByLabel("هاتف التوصيل *").fill(TEST_ADDRESS.phone);
    await page.getByLabel("المنطقة *").fill(TEST_ADDRESS.area);
    await page.getByLabel("العنوان بالتفصيل *").fill(TEST_ADDRESS.street);

    await page.getByRole("radio", { name: "الدفع عبر InstaPay" }).check();
    await expect(page.getByText("شحن أقل عند الدفع عبر InstaPay")).toBeVisible();

    const confirmButton = page.getByRole("button", { name: "تأكيد الطلب" });
    await expect(confirmButton).toBeEnabled({ timeout: 10_000 });
    await confirmButton.click();

    const modal = page.getByRole("dialog", { name: "الدفع عبر InstaPay" });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("button", { name: "أتممت التحويل" })).toBeVisible();
    await expect(modal.getByText(/المبلغ:/)).toBeVisible();

    // Cancel — no order placed, no API call made.
    await modal.getByRole("button", { name: "إلغاء" }).click();
    await expect(modal).not.toBeVisible();
    await expect(page.getByRole("radio", { name: "الدفع عبر InstaPay" })).toBeChecked();

    // Clean up the cart line so this spec is re-runnable.
    const cartRes = await page.request.get("/api/cart");
    if (cartRes.ok()) {
      const cart = (await cartRes.json()).data as { items: { id: string }[] } | undefined;
      for (const item of cart?.items ?? []) {
        await page.request.delete(`/api/cart/items/${item.id}`);
      }
    }
  });
});
