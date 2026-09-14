import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import {
  seedPartnerPair,
  seedLinkedDistributor,
  loginAs,
  cleanupPartnerPair,
  type PartnerFixturePair,
  type PartnerFixtureSide,
} from "./partner-fixtures";

/**
 * Backlog 5.5 (الشبكة — network) regression coverage, per `docs/redesign/03-backlog.md`'s
 * 5.5 entry and `05-partner-portal-v2.md` §4.5. Replaces `partner-distributors.spec.ts`
 * (backlog 4.21, deleted by this task — its three cases are folded in here: fixture
 * distributor numbers matching Prisma, the wrong-role panel, and the empty state) since
 * `/partner/distributors` now permanently redirects into `/partner/network`.
 *
 * Serial mode: one agent + two linked distributors (a seeded mix — one active with stock
 * and requests, one inactive with neither), cleaned up once at the end.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

const prisma = new PrismaClient();
let pair: PartnerFixturePair;
let distributorB: PartnerFixtureSide;
let productIds: string[] = [];
let variantA: { id: string; sku: string };
let variantB: { id: string; sku: string };
let fulfilledRequestId: string;
let pendingRequestId: string;

async function seedVariant(label: string): Promise<{ id: string; sku: string }> {
  const category = await prisma.category.findFirst({ select: { id: true } });
  if (!category) throw new Error("Need at least one Category seeded in the redesign DB to run this spec.");
  const unique = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: `منتج شبكة اختبار ${unique}`,
      slug: `network-test-${unique}`,
      active: true,
      variants: {
        create: [{ sku: `NETWORK-TEST-${unique}`, name: "M", pricePiastres: 10000 }],
      },
    },
    include: { variants: true },
  });
  productIds.push(product.id);
  return { id: product.variants[0].id, sku: product.variants[0].sku };
}

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma);
  distributorB = await seedLinkedDistributor(prisma, pair.agent.partnerId, {
    name: "موزع معطّل للاختبار",
    isActive: false,
  });

  variantA = await seedVariant("A");
  variantB = await seedVariant("B");

  // Distributor A (the main fixture pair's distributor): stock on both variants.
  await prisma.partnerInventory.createMany({
    data: [
      { partnerId: pair.distributor.partnerId, variantId: variantA.id, stockAvailable: 20, stockReserved: 5 },
      { partnerId: pair.distributor.partnerId, variantId: variantB.id, stockAvailable: 8, stockReserved: 2 },
    ],
  });

  // One FULFILLED request (qty 4) and one PENDING request (qty 6) from A to the agent ->
  // fill rate = 4 / (4 + 6) = 40%.
  const fulfilled = await prisma.restockRequest.create({
    data: {
      sourcePartnerId: pair.agent.partnerId,
      destinationPartnerId: pair.distributor.partnerId,
      status: "FULFILLED",
      fulfilledAt: new Date(),
      items: { create: [{ variantId: variantA.id, quantity: 4 }] },
    },
  });
  fulfilledRequestId = fulfilled.id;

  const pending = await prisma.restockRequest.create({
    data: {
      sourcePartnerId: pair.agent.partnerId,
      destinationPartnerId: pair.distributor.partnerId,
      status: "PENDING",
      items: { create: [{ variantId: variantB.id, quantity: 6 }] },
    },
  });
  pendingRequestId = pending.id;
});

test.afterAll(async () => {
  await prisma.restockRequestItem.deleteMany({ where: { restockRequestId: { in: [fulfilledRequestId, pendingRequestId] } } });
  await prisma.restockRequest.deleteMany({ where: { id: { in: [fulfilledRequestId, pendingRequestId] } } });
  await prisma.inventoryLedger.deleteMany({ where: { partnerId: { in: [pair.distributor.partnerId, distributorB.partnerId] } } });
  await prisma.partnerInventory.deleteMany({ where: { partnerId: { in: [pair.distributor.partnerId, distributorB.partnerId] } } });
  await prisma.variant.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await cleanupPartnerPair(prisma, pair, { partnerIds: [distributorB.partnerId], userIds: [distributorB.userId] });
  await prisma.$disconnect();
});

test("roster shows the seeded mix — active distributor's numbers match Prisma, inactive one shows no activity", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/network");

  const cardA = page.getByTestId("roster-card").filter({ hasText: pair.distributor.name });
  await expect(cardA).toBeVisible();
  await expect(cardA.getByText("نشط", { exact: true })).toBeVisible();
  await expect(cardA.locator('[dir="ltr"]', { hasText: pair.distributor.phone })).toBeVisible();

  // sellable = (20 - 5) + (8 - 2) = 21
  await expect(cardA.getByText("21", { exact: true })).toBeVisible();
  // pending requests = 1
  await expect(cardA.getByText("طلبات بانتظارك")).toBeVisible();
  await expect(cardA).toContainText("آخر نشاط");

  const cardB = page.getByTestId("roster-card").filter({ hasText: distributorB.name });
  await expect(cardB).toBeVisible();
  await expect(cardB.getByText("معطّل", { exact: true })).toBeVisible();
  await expect(cardB).toContainText("لا يوجد نشاط بعد");
});

test("detail sheet shows the distributor's stock, requests and fill rate; approving moves the request", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/network");

  const cardA = page.getByTestId("roster-card").filter({ hasText: pair.distributor.name });
  await cardA.click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText(pair.distributor.name)).toBeVisible();

  // Stock table.
  await expect(sheet.getByText(variantA.sku)).toBeVisible();
  await expect(sheet.getByText(variantB.sku)).toBeVisible();

  // Fill rate = 40%.
  await expect(sheet.getByText("40%", { exact: true })).toBeVisible();

  // The pending request card, with its approve action.
  const requestCard = sheet.getByTestId("restock-request-card").filter({ hasText: variantB.sku });
  await expect(requestCard).toBeVisible();
  await expect(requestCard.getByText("قيد المراجعة")).toBeVisible();

  await requestCard.getByRole("button", { name: "قبول" }).click();
  await expect(page.getByText("تم تحديث طلب الموزع", { exact: true })).toBeVisible();
  await expect(requestCard.getByText("مقبول")).toBeVisible();

  const updated = await prisma.restockRequest.findUnique({ where: { id: pendingRequestId } });
  expect(updated?.status).toBe("APPROVED");
});

test("keyboard: Enter opens the sheet, Escape closes it and returns focus to the card", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/network");

  const cardA = page.getByTestId("roster-card").filter({ hasText: pair.distributor.name });
  await cardA.focus();
  await page.keyboard.press("Enter");

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(cardA).toBeFocused();
});

test("distributor visiting the network page gets the role-gate panel, not the roster", async ({ page }) => {
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner/network");
  await expect(page.getByText("هذه الصفحة متاحة للوكلاء فقط")).toBeVisible();
  await expect(page.getByTestId("roster-card")).toHaveCount(0);
});
