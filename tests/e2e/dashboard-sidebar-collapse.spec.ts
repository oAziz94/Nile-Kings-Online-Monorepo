import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

/**
 * Backlog 7.1 — collapsible dashboard sidebar, partner v2 + admin. Partner half uses the
 * shared fixture helpers; admin half seeds a fixture user + one OPEN ticket the same way
 * `account-v2-admin-tickets.spec.ts` does (unique suffix, deleted in afterAll), just enough
 * to exercise the nav's ticket-count badge.
 */

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

const COLLAPSE_LABEL = "طيّ القائمة";
const EXPAND_LABEL = "فتح القائمة";

test.describe("partner v2 sidebar collapse", () => {
  test.describe.configure({ mode: "serial" });
  let pair: PartnerFixturePair;

  test.beforeAll(async () => {
    pair = await seedPartnerPair(prisma);
  });

  test.afterAll(async () => {
    await cleanupPartnerPair(prisma, pair);
  });

  test("collapse narrows the rail to 72px, hides labels from the accessible tree, hover/focus still reveals them via tooltip, reload persists it with no width jump, expand restores 248 and clears the key", async ({
    page,
  }) => {
    await loginAs(page, pair, "AGENT");
    await page.goto("/partner");

    const rail = page.getByTestId("dashboard-rail");
    const stockLink = page.getByRole("navigation", { name: "التنقل في لوحة الشريك" }).getByRole("link", {
      name: "المخزون",
    });

    // Expanded (today's layout) — rail is 248px, the label is in the accessible tree.
    await expect(rail).toBeVisible();
    let box = await rail.boundingBox();
    expect(box?.width).toBeCloseTo(248, 0);
    await expect(stockLink).toBeVisible();

    const collapseButton = page.getByRole("button", { name: COLLAPSE_LABEL });
    await expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    await collapseButton.click();

    // Collapsed — 72px, label gone from the accessible tree (still present visually-hidden,
    // but excluded from accessible-name computation), button flips to "فتح القائمة".
    box = await rail.boundingBox();
    expect(box?.width).toBeCloseTo(72, 0);
    await expect(
      page.getByRole("navigation", { name: "التنقل في لوحة الشريك" }).getByRole("link", { name: "المخزون" })
    ).toHaveCount(0);
    const expandButton = page.getByRole("button", { name: EXPAND_LABEL });
    await expect(expandButton).toHaveAttribute("aria-expanded", "false");

    // Hover reveals the label via a tooltip.
    const stockIconLink = page.locator('a[href="/partner/stock"]').first();
    await stockIconLink.hover();
    await expect(page.getByRole("tooltip", { name: "المخزون" })).toBeVisible();

    // Focus (keyboard) also reveals it.
    await stockIconLink.focus();
    await expect(page.getByRole("tooltip", { name: "المخزون" })).toBeVisible();

    // Reload keeps it collapsed — the <html> data attribute and the rail width are correct
    // immediately, with no expanded-then-narrow width jump, and localStorage carries the key.
    const stored = await page.evaluate(() => window.localStorage.getItem("nk.sidebar.collapsed"));
    expect(stored).toBe("1");
    await page.reload();
    const collapsedAttr = await page.evaluate(() => document.documentElement.dataset.sidebarCollapsed);
    expect(collapsedAttr).toBe("true");
    box = await page.getByTestId("dashboard-rail").boundingBox();
    expect(box?.width).toBeCloseTo(72, 0);

    // Expand restores 248 and clears the key.
    await page.getByRole("button", { name: EXPAND_LABEL }).click();
    box = await page.getByTestId("dashboard-rail").boundingBox();
    expect(box?.width).toBeCloseTo(248, 0);
    const clearedStored = await page.evaluate(() => window.localStorage.getItem("nk.sidebar.collapsed"));
    expect(clearedStored).toBeNull();
    const clearedAttr = await page.evaluate(() => document.documentElement.dataset.sidebarCollapsed);
    expect(clearedAttr).toBeUndefined();
  });

  test("at 390x844 the collapse control does not exist", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, pair, "AGENT");
    await page.goto("/partner");
    await expect(page.getByRole("button", { name: /طيّ القائمة|فتح القائمة/ })).toHaveCount(0);
  });

  test("reflows at 1440x900: /partner, /partner/orders and /partner/stock widen with no horizontal overflow when collapsed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, pair, "AGENT");
    for (const path of ["/partner", "/partner/orders", "/partner/stock"]) {
      await page.goto(path);
      await page.getByRole("button", { name: COLLAPSE_LABEL }).click();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
      await page.getByRole("button", { name: EXPAND_LABEL }).click();
    }
  });
});

const ADMIN_PHONE = "+201099955881";
const ADMIN_PASSWORD = "SidebarAdmin123!";
const CUSTOMER_PHONE = "+201099955882";
const CUSTOMER_PASSWORD = "SidebarCust123!";
const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 15000 });
}

test.describe("admin sidebar collapse", () => {
  test.describe.configure({ mode: "serial" });
  let adminUserId: string;
  let customerUserId: string;
  let categoryId: string;
  let productId: string;
  let variantId: string;
  let orderId: string;
  let ticketId: string;

  test.beforeAll(async () => {
    const admin = await prisma.user.upsert({
      where: { phone: ADMIN_PHONE },
      create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: "مسؤول اختبار الشريط الجانبي" },
      update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
    });
    adminUserId = admin.id;

    const customer = await prisma.user.upsert({
      where: { phone: CUSTOMER_PHONE },
      create: { phone: CUSTOMER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword(CUSTOMER_PASSWORD), name: "عميل اختبار الشريط الجانبي" },
      update: { passwordHash: await hashPassword(CUSTOMER_PASSWORD), role: "CUSTOMER" },
    });
    customerUserId = customer.id;

    const category = await prisma.category.create({
      data: { name: `فئة اختبار الشريط ${uniqueSuffix}`, slug: `test-cat-sidebar-${uniqueSuffix}` },
    });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: { categoryId, name: `منتج اختبار الشريط ${uniqueSuffix}`, slug: `test-product-sidebar-${uniqueSuffix}`, weightGrams: 200 },
    });
    productId = product.id;
    const variant = await prisma.variant.create({
      data: { productId, sku: `TEST-SDBR-${uniqueSuffix}`, name: "M", pricePiastres: 6000, stockAvailable: 0, stockReserved: 0 },
    });
    variantId = variant.id;

    const order = await prisma.order.create({
      data: {
        userId: customerUserId,
        status: "DELIVERED",
        subtotalPiastres: 6000,
        totalPiastres: 6000,
        shippingAddress: {
          governorate: "القاهرة",
          city: "مدينة نصر",
          area: "الحي الثامن",
          street: "شارع اختبار الشريط الجانبي",
          phone: "+201000000444",
        },
        shippingProvider: "Egypt Post",
        paymentMethod: "COD",
        items: {
          create: [
            {
              variantId,
              productName: product.name,
              variantName: `اختبار-${uniqueSuffix}`,
              sku: variant.sku,
              quantity: 1,
              unitPricePiastres: 6000,
              totalPiastres: 6000,
            },
          ],
        },
      },
    });
    orderId = order.id;

    const ticket = await prisma.orderTicket.create({
      data: {
        orderId,
        userId: customerUserId,
        subject: "DELIVERY_DELAY",
        contactPhone: CUSTOMER_PHONE,
        status: "OPEN",
        messages: { create: [{ authorRole: "CUSTOMER", authorUserId: customerUserId, body: "أين طلبي؟" }] },
      },
    });
    ticketId = ticket.id;
  });

  test.afterAll(async () => {
    await prisma.orderTicketMessage.deleteMany({ where: { ticketId } });
    await prisma.orderTicket.deleteMany({ where: { id: ticketId } });
    await prisma.orderItem.deleteMany({ where: { orderId } });
    await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.variant.deleteMany({ where: { id: variantId } });
    await prisma.product.deleteMany({ where: { id: productId } });
    await prisma.category.deleteMany({ where: { id: categoryId } });
    await prisma.user.deleteMany({ where: { id: { in: [adminUserId, customerUserId] } } });
    await prisma.$disconnect();
  });

  test("collapse narrows 224 -> 72 with the ticket badge still present, reload persists, expand restores 224", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin/orders");

    const rail = page.getByTestId("dashboard-rail");
    let box = await rail.boundingBox();
    expect(box?.width).toBeCloseTo(224, 0);

    await expect(page.getByLabel(/سؤال بانتظار الرد/)).toBeVisible();

    const collapseButton = page.getByRole("button", { name: COLLAPSE_LABEL });
    await collapseButton.click();

    box = await rail.boundingBox();
    expect(box?.width).toBeCloseTo(72, 0);
    // The badge (via its aria-label) is still present, just repositioned.
    await expect(page.getByLabel(/سؤال بانتظار الرد/)).toBeVisible();

    await page.reload();
    const collapsedAttr = await page.evaluate(() => document.documentElement.dataset.sidebarCollapsed);
    expect(collapsedAttr).toBe("true");
    box = await page.getByTestId("dashboard-rail").boundingBox();
    expect(box?.width).toBeCloseTo(72, 0);

    await page.getByRole("button", { name: EXPAND_LABEL }).click();
    box = await page.getByTestId("dashboard-rail").boundingBox();
    expect(box?.width).toBeCloseTo(224, 0);
  });

  test("at 390x844 the collapse control does not exist", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAsAdmin(page);
    await page.goto("/admin/orders");
    await expect(page.getByRole("button", { name: /طيّ القائمة|فتح القائمة/ })).toHaveCount(0);
  });

  test("reflows at 1440x900: /admin/orders and /admin/products widen with no horizontal overflow when collapsed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAsAdmin(page);
    for (const path of ["/admin/orders", "/admin/products"]) {
      await page.goto(path);
      await page.getByRole("button", { name: COLLAPSE_LABEL }).click();
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
      await page.getByRole("button", { name: EXPAND_LABEL }).click();
    }
  });
});
