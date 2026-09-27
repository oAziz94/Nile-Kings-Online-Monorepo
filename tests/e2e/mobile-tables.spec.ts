import { test, expect, devices, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, hashPassword, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";

/**
 * Backlog 10.33 — dashboard tables clipped on phones, no sideways swipe. Exit criterion:
 * on the partner and admin order detail, the items table wrapper (`scrollWidth >
 * clientWidth`), scrolling it reveals the last column, no page-level horizontal overflow,
 * and the first column stays put (sticky) while scrolling. Same three assertions on
 * `/partner/stock`. Screenshots at 390×844 (before/after scroll) and 1514×681.
 *
 * Fixture pattern: `admin-v2-orders.spec.ts` (admin user via prisma upsert) +
 * `partner-v2-orders.spec.ts` (`seedPartnerPair`) — one order with 3 line items, assigned
 * to the fixture agent, viewed both as the admin and as the agent.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

const prisma = new PrismaClient();

const ADMIN_PHONE = "+201099966301";
const ADMIN_PASSWORD = "AdminMobileTablesTest123!";
const ADMIN_NAME = "مسؤول اختبار الجداول";
const CUSTOMER_PHONE = "+201099966302";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

let adminUserId: string;
let customerUserId: string;
let pair: PartnerFixturePair;
let categoryId: string;
let productId: string;
const variantIds: string[] = [];
let orderId: string;
let routedOrderId: string;

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 20_000 });
}

test.beforeAll(async () => {
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: ADMIN_NAME },
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN", name: ADMIN_NAME },
  });
  adminUserId = admin.id;

  const customer = await prisma.user.create({
    data: { phone: CUSTOMER_PHONE, role: "CUSTOMER", passwordHash: crypto.randomBytes(8).toString("hex"), name: `عميل جداول ${uniqueSuffix}` },
  });
  customerUserId = customer.id;

  pair = await seedPartnerPair(prisma);

  const category = await prisma.category.create({
    data: { name: `فئة جداول ${uniqueSuffix}`, slug: `mobile-tables-cat-${uniqueSuffix}` },
  });
  categoryId = category.id;
  const product = await prisma.product.create({
    data: { categoryId, name: `منتج جداول الموبايل ${uniqueSuffix}`, slug: `mobile-tables-product-${uniqueSuffix}`, active: true, weightGrams: 300 },
  });
  productId = product.id;

  const sizes = ["S", "M", "L"];
  const colors = ["أسود", "أبيض", "أحمر"];
  const variants = [];
  for (let i = 0; i < 3; i++) {
    const variant = await prisma.variant.create({
      data: {
        productId,
        sku: `MT-${i}-${uniqueSuffix}`,
        name: sizes[i],
        colorName: colors[i],
        pricePiastres: 15000 + i * 1000,
      },
    });
    variantIds.push(variant.id);
    variants.push(variant);
  }

  await prisma.partnerInventory.createMany({
    data: variantIds.map((variantId) => ({
      partnerId: pair.agent.partnerId,
      variantId,
      stockAvailable: 20,
      stockReserved: 0,
    })),
  });

  const shippingAddress = { governorate: "القاهرة", city: "القاهرة", area: "مدينة نصر", street: "شارع اختبار الجداول" };
  const unitPrice = 15000;
  const order = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "CONFIRMED",
      assignedPartnerId: pair.agent.partnerId,
      subtotalPiastres: unitPrice * 3,
      totalPiastres: unitPrice * 3,
      shippingAddress,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      items: {
        create: variants.map((v, i) => ({
          variantId: v.id,
          productName: product.name,
          variantName: `${product.slug}-${v.sku}`,
          sku: v.sku,
          quantity: i + 1,
          unitPricePiastres: unitPrice,
          totalPiastres: unitPrice * (i + 1),
        })),
      },
    },
  });
  orderId = order.id;

  const routed = await prisma.routedOrder.create({
    data: { orderId, governorate: "القاهرة", partnerId: pair.agent.partnerId, assignmentMode: "AUTO", status: "ASSIGNED" },
  });
  routedOrderId = routed.id;

  await prisma.partnerInventory.updateMany({
    where: { partnerId: pair.agent.partnerId, variantId: { in: variantIds } },
    data: { stockReserved: { increment: 1 } },
  });
});

test.afterAll(async () => {
  await prisma.adminAuditLog.deleteMany({ where: safeWhere({ entityId: orderId }) });
  await prisma.inventoryLedger.deleteMany({ where: safeWhere({ orderId }) });
  await prisma.orderAuditLog.deleteMany({ where: safeWhere({ orderId }) });
  await prisma.routedOrder.deleteMany({ where: safeWhere({ id: routedOrderId }) });
  await prisma.orderItem.deleteMany({ where: safeWhere({ orderId }) });
  await prisma.order.deleteMany({ where: safeWhere({ id: orderId }) });
  await cleanupPartnerPair(prisma, pair);
  await prisma.variant.deleteMany({ where: { id: { in: variantIds } } });
  await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, customerUserId] } } });
  await prisma.$disconnect();
});

/**
 * Shared assertion set for the exit criterion — given a page already on a dashboard route
 * with at least one wide table, checks (against the *first* `<table>` on the page):
 * (1) the scroll wrapper (the table's direct parent) has more scrollWidth than clientWidth,
 * (2) scrolling it to the far (RTL: negative) edge brings the last column's cell fully
 *     inside the viewport,
 * (3) the first column's cell stays at the same x position before/after (sticky),
 * (4) `document.documentElement` itself never overflows horizontally.
 */
async function assertTableSwipesAndPageDoesNotOverflow(page: Page) {
  const table = page.locator("table").first();
  await expect(table).toBeVisible({ timeout: 20_000 });
  const wrapper = table.locator("xpath=..");

  const { scrollWidth, clientWidth } = await wrapper.evaluate((el) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(scrollWidth, "table wrapper scrollWidth should exceed clientWidth (must be scrollable)").toBeGreaterThan(
    clientWidth
  );

  const firstRow = table.locator("tbody tr").first();
  const firstCell = firstRow.locator("> *").first();
  const lastCell = firstRow.locator("> *").last();

  const firstCellBoxBefore = await firstCell.boundingBox();
  expect(firstCellBoxBefore).not.toBeNull();

  // Full swipe to the far edge — RTL, so the far (reveal-more) direction is negative
  // `scrollLeft` (backlog 10.33 / `hooks/use-edge-scroll-fade.ts`).
  await wrapper.evaluate((el) => {
    el.scrollLeft = -(el.scrollWidth);
  });
  await page.waitForTimeout(100);

  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  const lastCellBox = await lastCell.boundingBox();
  expect(lastCellBox).not.toBeNull();
  expect(lastCellBox!.x).toBeGreaterThanOrEqual(-1);
  expect(lastCellBox!.x + lastCellBox!.width).toBeLessThanOrEqual(viewport!.width + 1);

  const firstCellBoxAfter = await firstCell.boundingBox();
  expect(firstCellBoxAfter).not.toBeNull();
  expect(Math.abs(firstCellBoxAfter!.x - firstCellBoxBefore!.x)).toBeLessThanOrEqual(1);

  const pageOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
  expect(pageOverflow, "document.documentElement must not overflow horizontally").toBe(true);
}

/**
 * 10.33 rework (coordinator follow-up): the sticky first cell used to carry its own
 * hardcoded `bg-white`, seaming visibly against the row's `hover:bg-muted/50`/`hover:bg-stone-50`
 * tint. Both `components/ui/table.tsx` and `components/ui/data-table.tsx` now give the
 * sticky cell `bg-inherit` and put the real (opaque) background on the `<tr>` itself, so
 * hovering the row repaints the sticky cell identically. A "normal" `<td>`/`<th>` never sets
 * its own `background-color` (it always shows the row's paint through — that's exactly why
 * the sticky cell needed the fix; a normal cell's own computed `background-color` is
 * `rgba(0, 0, 0, 0)` regardless of the row's state), so the meaningful comparison is between
 * the sticky cell's computed color and the *row*'s — confirms they're identical at rest and
 * on hover, and that hover actually changes the color (i.e. the hover class took effect).
 */
async function assertStickyCellInheritsRowHover(page: Page) {
  const table = page.locator("table").first();
  await expect(table).toBeVisible({ timeout: 20_000 });
  const firstRow = table.locator("tbody tr").first();

  // Read the row's and the sticky cell's `background-color` in one synchronous evaluation
  // (not two round-trips) — both classes carry `transition-colors`, so two sequential reads
  // could otherwise catch two different animation frames and report a false mismatch.
  const readBoth = () =>
    firstRow.evaluate((row) => {
      const cell = row.firstElementChild as HTMLElement;
      return {
        row: getComputedStyle(row).backgroundColor,
        cell: getComputedStyle(cell).backgroundColor,
      };
    });

  const rest = await readBoth();
  expect(rest.cell, "sticky cell must match its row's background-color at rest").toBe(rest.row);
  const restCellColor = rest.cell;

  await firstRow.hover();
  // Let the `transition-colors` (Tailwind default 150ms) finish before reading it back.
  await page.waitForTimeout(300);

  const hover = await readBoth();
  const hoverRowColor = hover.row;
  const hoverCellColor = hover.cell;
  expect(hoverCellColor, "sticky cell must match its row's background-color on hover").toBe(hoverRowColor);
  // Some tables (e.g. `/partner/stock`, whose rows aren't clickable — no `onRowClick`) never
  // get a `hover:` class at all, so rest and hover are legitimately identical there; only
  // assert the tint actually changed where the row *is* clickable (has a hover class to begin
  // with) — the seam check above is the one that matters everywhere.
  const isClickableRow = await firstRow.evaluate((el) => getComputedStyle(el).cursor === "pointer");
  if (isClickableRow) {
    expect(hoverCellColor, "hover must actually change the color from rest on a clickable row").not.toBe(restCellColor);
  }
  console.log(
    `[10.33] hover colours — rest: ${restCellColor} (row ${rest.row}), hover: ${hoverCellColor} (row ${hoverRowColor}), clickable: ${isClickableRow}`
  );
}

test("partner order detail: items table swipes, page does not overflow, first column sticky (Pixel 5, 390×844)", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["Pixel 5"] });
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(pair.agent.localPhone);
  await page.getByLabel("كلمة المرور").fill(pair.password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

  await page.goto(`/partner/orders/${orderId}`);
  await expect(page.getByText(`القطع (3)`)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/10.33/partner-order-detail-390x844-before.png", fullPage: false });

  // Mid-scroll: the sticky first column (image) must stay fully opaque over the columns
  // passing underneath it, not just at rest or fully scrolled (coordinator follow-up).
  const midScrollWrapper = page.locator("table").first().locator("xpath=..");
  await midScrollWrapper.evaluate((el) => {
    el.scrollLeft = -(el.scrollWidth - el.clientWidth) / 2;
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: "test-results/10.33/partner-order-detail-390x844-mid-scroll.png", fullPage: false });
  await midScrollWrapper.evaluate((el) => {
    el.scrollLeft = 0;
  });

  await assertTableSwipesAndPageDoesNotOverflow(page);

  await page.waitForTimeout(150);
  await page.screenshot({ path: "test-results/10.33/partner-order-detail-390x844-after.png", fullPage: false });

  await context.close();
});

test("admin order detail: items table swipes, page does not overflow, first column sticky (Pixel 5, 390×844)", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["Pixel 5"] });
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);

  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByText(`القطع (3)`)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/10.33/admin-order-detail-390x844-before.png", fullPage: false });

  await assertTableSwipesAndPageDoesNotOverflow(page);

  await page.waitForTimeout(150);
  await page.screenshot({ path: "test-results/10.33/admin-order-detail-390x844-after.png", fullPage: false });

  await context.close();
});

test("partner stock: table swipes, page does not overflow, first column sticky (Pixel 5, 390×844)", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["Pixel 5"] });
  const page = await context.newPage();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(pair.agent.localPhone);
  await page.getByLabel("كلمة المرور").fill(pair.password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

  await page.goto("/partner/stock");
  await expect(page.getByPlaceholder("بحث بالاسم أو SKU…")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/10.33/partner-stock-390x844-before.png", fullPage: false });

  await assertTableSwipesAndPageDoesNotOverflow(page);

  await page.waitForTimeout(150);
  await page.screenshot({ path: "test-results/10.33/partner-stock-390x844-after.png", fullPage: false });

  await context.close();
});

test("desktop (1514×681) is unchanged: partner detail, admin detail, partner stock", async ({ page }) => {
  await page.setViewportSize({ width: 1514, height: 681 });
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(pair.agent.localPhone);
  await page.getByLabel("كلمة المرور").fill(pair.password);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

  await page.goto(`/partner/orders/${orderId}`);
  await expect(page.getByText(`القطع (3)`)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(200);
  let overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);
  await assertStickyCellInheritsRowHover(page);
  await page.screenshot({ path: "test-results/10.33/partner-order-detail-1514x681.png", fullPage: true });

  await page.goto("/partner/stock");
  await expect(page.getByPlaceholder("بحث بالاسم أو SKU…")).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(200);
  overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);
  await assertStickyCellInheritsRowHover(page);
  await page.screenshot({ path: "test-results/10.33/partner-stock-1514x681.png", fullPage: true });

  // Switching from the agent to the admin session: clear the agent's cookies first — reusing
  // the same `page` while still signed in as the agent redirects `/login` straight back out
  // before the phone field ever renders (this bit the first run of this spec: a 90s timeout
  // waiting for a field that never appears).
  await page.context().clearCookies();
  await loginAsAdmin(page);
  await page.goto(`/admin/orders/${orderId}`);
  await expect(page.getByText(`القطع (3)`)).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(200);
  overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  expect(overflow).toBe(true);
  await assertStickyCellInheritsRowHover(page);
  await page.screenshot({ path: "test-results/10.33/admin-order-detail-1514x681.png", fullPage: true });
});
