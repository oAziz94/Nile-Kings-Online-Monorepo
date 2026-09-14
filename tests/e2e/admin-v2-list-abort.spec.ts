import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { hashPassword, loginWithPhone } from "./partner-fixtures";

/**
 * Backlog 9.0b (iii): every `useListUrlState` consumer's search-on-keystroke fetch now goes
 * through `useRequestAbort()` (hooks/use-list-url-state.ts), which aborts whatever request
 * this list last started before firing the next one — so a slow earlier response can never
 * land after a faster later one and overwrite it with stale data.
 *
 * Proof, on the admin orders list (`/admin/orders`, `app/(admin)/admin/orders/page.tsx`):
 * intercept `GET /api/admin/orders` and delay the response for the *first* search term by
 * 3s; type it, then immediately type a second, distinct search term whose response is not
 * delayed. Without the abort, the slow first response can resolve after the fast second one
 * and repaint the table with the first term's (stale) results. With the abort, the first
 * request is cancelled the moment the second one starts, so its response — even though the
 * route handler still lets it resolve 3s later, since aborting client-side doesn't stop this
 * test's simulated server delay — never reaches a `.then` that calls `setOrders`.
 */
test.describe.configure({ mode: "serial" });
// Backlog 9.0d: a cold Turbopack server's first compile can push a request well past
// Playwright's 30s default; 60s is this suite's floor.
test.setTimeout(60_000);

const prisma = new PrismaClient();

const ADMIN_PHONE = "+201099966301";
const ADMIN_PASSWORD = "AdminAbortTest123!";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const SLOW_CUSTOMER_PHONE = `+201099966${String(300 + (Date.now() % 45)).padStart(3, "0")}`;
const FAST_CUSTOMER_PHONE = `+201099966${String(400 + (Date.now() % 45)).padStart(3, "0")}`;

let adminUserId: string;
let slowCustomerId: string;
let fastCustomerId: string;
let categoryId: string;
let productId: string;
let variantId: string;
const orderIds: string[] = [];

// The list's "العميل" column renders the customer's name — searching this term filters to
// exactly one of the two seeded orders below (`q` matches `user.name`, see
// app/api/admin/orders/route.ts).
const SLOW_TERM = `بطيء-${uniqueSuffix}`;
const FAST_TERM = `سريع-${uniqueSuffix}`;

test.beforeAll(async () => {
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: `مسؤول 9.0b-iii ${uniqueSuffix}` },
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
  });
  adminUserId = admin.id;

  const slowCustomer = await prisma.user.upsert({
    where: { phone: SLOW_CUSTOMER_PHONE },
    create: { phone: SLOW_CUSTOMER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword("AbortTestCust123!"), name: `عميل ${SLOW_TERM}` },
    update: { name: `عميل ${SLOW_TERM}` },
  });
  slowCustomerId = slowCustomer.id;

  const fastCustomer = await prisma.user.upsert({
    where: { phone: FAST_CUSTOMER_PHONE },
    create: { phone: FAST_CUSTOMER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword("AbortTestCust123!"), name: `عميل ${FAST_TERM}` },
    update: { name: `عميل ${FAST_TERM}` },
  });
  fastCustomerId = fastCustomer.id;

  const category = await prisma.category.create({
    data: { name: `فئة 9.0b-iii ${uniqueSuffix}`, slug: `cat-9-0b-iii-${uniqueSuffix}` },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: { categoryId, name: `منتج 9.0b-iii ${uniqueSuffix}`, slug: `p-9-0b-iii-${uniqueSuffix}`, active: true },
  });
  productId = product.id;

  const variant = await prisma.variant.create({
    data: { productId, sku: `SKU-9-0B-III-${uniqueSuffix}`, name: "M", pricePiastres: 10000 },
  });
  variantId = variant.id;

  const baseAddress = {
    governorate: "القاهرة",
    city: "القاهرة",
    area: "test",
    street: "test",
    building: "1",
    floor: "1",
    apartment: "1",
    phone: "01000000000",
  };

  // Two orders, one per customer above — searching either term filters to exactly one row.
  for (const [userId, suffix] of [[slowCustomerId, "slow"], [fastCustomerId, "fast"]] as const) {
    const order = await prisma.order.create({
      data: {
        userId,
        status: "CONFIRMED",
        subtotalPiastres: 10000,
        totalPiastres: 10000,
        shippingAddress: baseAddress,
        shippingProvider: "Egypt Post",
        paymentMethod: "COD",
        items: {
          create: [
            {
              variantId,
              productName: `منتج 9.0b-iii ${uniqueSuffix}`,
              variantName: "M",
              sku: `SKU-9-0B-III-${suffix}-${uniqueSuffix}`,
              quantity: 1,
              unitPricePiastres: 10000,
              totalPiastres: 10000,
            },
          ],
        },
      },
    });
    orderIds.push(order.id);
  }
});

test.afterAll(async () => {
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.variant.deleteMany({ where: { id: variantId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, slowCustomerId, fastCustomerId] } } });
  await prisma.$disconnect();
});

test("admin orders search: a slow earlier response never overwrites a faster later one", async ({ page }) => {
  await loginWithPhone(page, ADMIN_PHONE.replace("+20", ""), ADMIN_PASSWORD);
  await page.goto("/admin/orders");

  let sawSlowRequestStart = false;
  await page.route("**/api/admin/orders?*", async (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get("q") ?? "";
    if (q === SLOW_TERM) {
      sawSlowRequestStart = true;
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
    await route.continue();
  });

  // The list renders a mobile card layout and a desktop table in the same DOM, one hidden by
  // CSS at this (desktop) viewport — scope every assertion to the visible one so the hidden
  // duplicate never causes a false "hidden" match.
  const visibleText = (text: string) => page.locator(":visible", { hasText: text });

  const search = page.getByPlaceholder("رقم الطلب أو العميل أو الهاتف");
  await search.fill(SLOW_TERM);
  // The hook debounces 400ms before firing; give it time to actually send the (now-delayed)
  // request before moving on.
  await expect.poll(() => sawSlowRequestStart, { timeout: 5_000 }).toBe(true);

  await search.fill(FAST_TERM);
  // The fast term's own request is not delayed — its result should show well within the
  // slow term's still-pending 3s.
  await expect(visibleText(FAST_TERM).first()).toBeVisible({ timeout: 5_000 });
  await expect(visibleText(SLOW_TERM)).toHaveCount(0);

  // Now wait past the slow response's 3s delay — if it were still able to overwrite the
  // table, the slow term's row would appear here and the fast term's would disappear.
  await page.waitForTimeout(3_500);
  await expect(visibleText(FAST_TERM).first()).toBeVisible();
  await expect(visibleText(SLOW_TERM)).toHaveCount(0);
});
