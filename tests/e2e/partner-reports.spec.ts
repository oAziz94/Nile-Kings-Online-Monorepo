import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";
import { rangeForPreset } from "../../lib/analytics/date-range";

/**
 * Backlog 4.22 (partner reports: revenue, stock, funnel) e2e coverage. Per the backlog
 * entry: "agent and distributor: presets drive the params, KPIs equal a direct
 * `section=kpis` call, the stock panel flags a seeded low line; export links carry
 * from/to." Serial mode: one seeded fixture pair + one seeded product/variant/orders,
 * shared by both role checks, cleaned up once.
 */
test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
let pair: PartnerFixturePair;
let categoryId: string;
let productId: string;
let variantId: string;
let customerUserId: string;
const orderIds: string[] = [];

const RUN_STAMP = Date.now();
const SKU = `E2E-RPT-${RUN_STAMP}`;

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma);

  const category = await prisma.category.create({
    data: { name: "فئة اختبار التقارير", slug: `reports-e2e-${RUN_STAMP}` },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: {
      categoryId,
      name: "منتج اختبار التقارير",
      slug: `reports-e2e-product-${RUN_STAMP}`,
      active: true,
    },
  });
  productId = product.id;

  const variant = await prisma.variant.create({
    data: {
      productId,
      sku: SKU,
      name: "M",
      pricePiastres: 5000,
      stockAvailable: 100,
      stockReserved: 0,
    },
  });
  variantId = variant.id;

  // Low-stock lines (sellable <= the default lowStockThreshold of 5) for both roles' own inventory.
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId, stockAvailable: 3, stockReserved: 0 },
  });
  await prisma.partnerInventory.create({
    data: { partnerId: pair.distributor.partnerId, variantId, stockAvailable: 2, stockReserved: 0 },
  });

  const customer = await prisma.user.create({
    data: { phone: `+2010${String(RUN_STAMP).slice(-8)}`, role: "CUSTOMER" },
  });
  customerUserId = customer.id;

  for (const side of [pair.agent, pair.distributor]) {
    const order = await prisma.order.create({
      data: {
        userId: customerUserId,
        status: "DELIVERED",
        subtotalPiastres: 10000,
        totalPiastres: 10000,
        shippingAddress: {
          governorate: "القاهرة",
          city: "القاهرة",
          area: "test",
          street: "test",
          building: "1",
          floor: "1",
          apartment: "1",
          phone: "01000000000",
        },
        shippingProvider: "Egypt Post",
        paymentMethod: "COD",
        assignedPartnerId: side.partnerId,
        items: {
          create: [
            {
              variantId,
              productName: "منتج اختبار التقارير",
              variantName: "M",
              sku: SKU,
              quantity: 2,
              unitPricePiastres: 5000,
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
  await prisma.partnerInventory.deleteMany({ where: { variantId } });
  await prisma.inventoryLedger.deleteMany({ where: { variantId } });
  await prisma.variant.deleteMany({ where: { id: variantId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { id: customerUserId } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.$disconnect();
});

async function checkReportsForRole(page: Page, role: "AGENT" | "DISTRIBUTOR") {
  await loginAs(page, pair, role);
  await page.goto("/partner/reports");
  await expect(page.getByRole("heading", { name: "التقارير" })).toBeVisible();
  // The redesign DB's seeded catalog is production-scale (thousands of active variants);
  // the products panel is an unpaginated client-side table by design-parity requirement
  // (see docs/redesign/00-feature-inventory/partner/reports.md's edge cases — flagged, not
  // fixed, at this data volume), so the first full render can take longer than the default
  // assertion timeout on this seed data. Give it real room rather than flaking.
  await expect(page.getByText("تم التسليم فقط")).toBeVisible({ timeout: 45_000 });

  // Default range on load is the 30d preset; its button is highlighted.
  const range30 = rangeForPreset("30d");
  await expect(page.locator("#partner-report-from")).toHaveValue(range30.from);
  await expect(page.locator("#partner-report-to")).toHaveValue(range30.to);

  // Switching to "من البداية" drives the from/to inputs to that preset's computed range.
  await page.getByRole("button", { name: "من البداية" }).click();
  const rangeAll = rangeForPreset("all");
  await expect(page.locator("#partner-report-from")).toHaveValue(rangeAll.from);
  await expect(page.locator("#partner-report-to")).toHaveValue(rangeAll.to);
  await page.waitForLoadState("networkidle", { timeout: 60_000 });

  // KPIs on screen equal a direct section=kpis call for the same range.
  const kpiRes = await page.request.get(
    `/api/partner/analytics?section=kpis&from=${rangeAll.from}&to=${rangeAll.to}`,
    { timeout: 60_000 }
  );
  expect(kpiRes.ok()).toBe(true);
  const kpiJson = await kpiRes.json();
  const totalEgp = (kpiJson.data.totalRevenuePiastres / 100).toLocaleString("en-US");
  await expect(page.getByText(`${totalEgp} ج.م`).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(String(kpiJson.data.orderCount)).first()).toBeVisible({ timeout: 30_000 });

  // The stock report panel flags the seeded low line.
  await expect(page.getByText(SKU).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("منخفض").first()).toBeVisible({ timeout: 30_000 });

  // Export links carry the currently selected from/to. The export response is a
  // `Content-Disposition: attachment` download, not a navigable page, so the auxiliary
  // tab's `url()` can stay "about:blank" — assert on the outgoing request instead.
  const [summaryRequest] = await Promise.all([
    page.context().waitForEvent("request", (r) => r.url().includes("/api/partner/analytics/export")),
    page.getByRole("button", { name: "تصدير الملخص" }).click(),
  ]);
  const summaryUrl = new URL(summaryRequest.url());
  expect(summaryUrl.searchParams.get("report")).toBe("summary");
  expect(summaryUrl.searchParams.get("from")).toBe(rangeAll.from);
  expect(summaryUrl.searchParams.get("to")).toBe(rangeAll.to);

  const stockPanel = page.locator("text=تقرير المخزون").locator("xpath=ancestor::div[contains(@class,'rounded-[14px]')][1]");
  const [stockRequest] = await Promise.all([
    page.context().waitForEvent("request", (r) => r.url().includes("/api/partner/analytics/export")),
    stockPanel.getByRole("button", { name: "تصدير CSV" }).click(),
  ]);
  const stockUrl = new URL(stockRequest.url());
  expect(stockUrl.searchParams.get("report")).toBe("stock");
  expect(stockUrl.searchParams.get("from")).toBe(rangeAll.from);
  expect(stockUrl.searchParams.get("to")).toBe(rangeAll.to);
}

test("agent: presets drive params, KPIs match a direct API call, stock panel flags the seeded low line, exports carry from/to", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await checkReportsForRole(page, "AGENT");
});

test("distributor: sees the same reports scoped to their own data (presets, KPIs, low-stock flag, exports)", async ({
  page,
}) => {
  test.setTimeout(150_000);
  await checkReportsForRole(page, "DISTRIBUTOR");
});
