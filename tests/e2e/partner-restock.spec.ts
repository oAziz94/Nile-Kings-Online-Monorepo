import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

/**
 * Backlog 4.20 (restock requests / distributor requests) regression coverage, per
 * `docs/redesign/00-feature-inventory/partner/{restock-requests,distributor-requests}.md`
 * and the task's approved changes: (a) the fulfill confirm dialog, (b) the agent-side
 * inline distributor-stock line, (c) the Arabic no-linked-agent message (covered by unit
 * test coverage of the create path elsewhere — the fixture pair is always linked, so this
 * spec exercises the happy path), (d) the distributor's PENDING cancel action.
 *
 * Serial mode: one seeded fixture pair + two dedicated products/variants (seeded here,
 * not borrowed from whatever happens to be "most recent" in the shared redesign DB —
 * other worktrees run their own e2e specs against the same branch concurrently, which
 * makes "most recently created variant" queries flaky), cleaned up once at the end.
 */
test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
let pair: PartnerFixturePair;
let productIds: string[] = [];
let variantA: { id: string; sku: string; productName: string };
let variantB: { id: string; sku: string; productName: string };

async function seedTestVariant(label: string): Promise<{ id: string; sku: string; productName: string }> {
  const category = await prisma.category.findFirst({ select: { id: true } });
  if (!category) throw new Error("Need at least one Category seeded in the redesign DB to run this spec.");

  const unique = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const productName = `منتج اختبار إعادة التوريد ${unique}`;
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      name: productName,
      slug: `restock-test-${unique}`,
      active: true,
      variants: {
        create: [
          {
            sku: `RESTOCK-TEST-${unique}`,
            name: "M",
            pricePiastres: 10000,
            stockAvailable: 0,
            stockReserved: 0,
          },
        ],
      },
    },
    include: { variants: true },
  });
  productIds.push(product.id);
  return { id: product.variants[0].id, sku: product.variants[0].sku, productName };
}

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma);
  variantA = await seedTestVariant("A");
  variantB = await seedTestVariant("B");

  // Seed the agent with enough stock to fulfil variantB's request.
  await prisma.partnerInventory.upsert({
    where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: variantB.id } },
    update: { stockAvailable: 50, stockReserved: 0 },
    create: { partnerId: pair.agent.partnerId, variantId: variantB.id, stockAvailable: 50, stockReserved: 0 },
  });
});

test.afterAll(async () => {
  await cleanupPartnerPair(prisma, pair);
  await prisma.variant.deleteMany({ where: { productId: { in: productIds } } });
  await prisma.product.deleteMany({ where: { id: { in: productIds } } });
  await prisma.$disconnect();
});

test("distributor creates then cancels one request; creates another; agent sees distributor stock inline; dialog cancel does nothing; confirm moves stock and writes ledger rows", async ({
  page,
}) => {
  // --- Distributor: create request A (to be cancelled) ---
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner/restock-requests");

  await createDraftLine(page, variantA.sku, 3);
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page.getByText("تم إرسال طلب إعادة التوريد", { exact: true })).toBeVisible();

  const rowA = page.getByRole("row").filter({ hasText: variantA.sku });
  await expect(rowA.getByText("قيد المراجعة")).toBeVisible();

  // Cancel request A.
  await rowA.getByRole("button", { name: "إلغاء الطلب" }).click();
  const cancelDialog = page.getByRole("dialog");
  await expect(cancelDialog).toBeVisible();
  await cancelDialog.getByRole("button", { name: "إلغاء الطلب" }).click();
  await expect(cancelDialog).toBeHidden();
  await expect(page.getByText("تم إلغاء الطلب", { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(rowA.getByText("ملغي")).toBeVisible();
  await expect(rowA.getByRole("button", { name: "إلغاء الطلب" })).toHaveCount(0);

  // --- Distributor: create request B (to be fulfilled by the agent) ---
  await createDraftLine(page, variantB.sku, 5);
  await page.getByRole("button", { name: "إرسال الطلب" }).click();
  await expect(page.getByText("تم إرسال طلب إعادة التوريد", { exact: true })).toBeVisible();
  const rowB = page.getByRole("row").filter({ hasText: variantB.sku });
  await expect(rowB.getByText("قيد المراجعة")).toBeVisible();

  // --- Agent: review the incoming request ---
  await page.context().clearCookies();
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/distributor-requests");

  const card = page.getByTestId("restock-request-card").filter({ hasText: variantB.sku });
  await expect(card).toBeVisible();
  // Backlog 4.20 (b): agent-only inline distributor-stock line.
  await expect(card.getByText("متاح لدى الموزع")).toBeVisible();

  // Dialog cancel does nothing — status stays PENDING.
  await card.getByRole("button", { name: "تنفيذ التحويل" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "إلغاء", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(card.getByText("قيد المراجعة")).toBeVisible();

  // Confirm the transfer.
  await card.getByRole("button", { name: "تنفيذ التحويل" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "تأكيد ونقل المخزون" }).click();
  await expect(page.getByText("تم تحديث طلب الموزع", { exact: true })).toBeVisible();
  await expect(card.getByText("تم التنفيذ")).toBeVisible();

  // --- Assert the real stock movement and ledger via Prisma ---
  const [agentInventory, distributorInventory] = await Promise.all([
    prisma.partnerInventory.findUnique({
      where: { partnerId_variantId: { partnerId: pair.agent.partnerId, variantId: variantB.id } },
    }),
    prisma.partnerInventory.findUnique({
      where: { partnerId_variantId: { partnerId: pair.distributor.partnerId, variantId: variantB.id } },
    }),
  ]);
  expect(agentInventory?.stockAvailable).toBe(45);
  expect(distributorInventory?.stockAvailable).toBe(5);

  const restockRequest = await prisma.restockRequest.findFirst({
    where: { destinationPartnerId: pair.distributor.partnerId, status: "FULFILLED" },
  });
  expect(restockRequest).not.toBeNull();

  const ledgerRows = await prisma.inventoryLedger.findMany({
    where: { restockRequestId: restockRequest!.id, variantId: variantB.id },
  });
  const reasons = ledgerRows.map((row) => `${row.partnerId}:${row.reason}`).sort();
  expect(reasons).toEqual(
    [
      `${pair.distributor.partnerId}:RESTOCK_REQUEST_CREATE`,
      `${pair.agent.partnerId}:TRANSFER_OUT`,
      `${pair.distributor.partnerId}:RESTOCK_REQUEST_FULFILL`,
      `${pair.distributor.partnerId}:TRANSFER_IN`,
    ].sort()
  );

  // --- Cleanup this test's own created rows before the shared afterAll runs ---
  const cancelledRequest = await prisma.restockRequest.findFirst({
    where: { destinationPartnerId: pair.distributor.partnerId, status: "CANCELLED" },
  });
  await prisma.restockRequestItem.deleteMany({
    where: { restockRequestId: { in: [restockRequest!.id, cancelledRequest?.id ?? ""] } },
  });
  await prisma.restockRequest.deleteMany({
    where: { id: { in: [restockRequest!.id, cancelledRequest?.id ?? ""] } },
  });
  await prisma.inventoryLedger.deleteMany({ where: { restockRequestId: restockRequest!.id } });
  await prisma.partnerInventory.deleteMany({
    where: { partnerId: { in: [pair.agent.partnerId, pair.distributor.partnerId] }, variantId: variantB.id },
  });
});

async function createDraftLine(page: import("@playwright/test").Page, sku: string, quantity: number) {
  await page.getByPlaceholder("بحث عن منتج أو SKU").fill(sku);
  const select = page.locator("#variant-select");
  await expect(select).toContainText(sku, { timeout: 10_000 });
  await select.selectOption({ label: await select.locator(`option:has-text("${sku}")`).textContent() as string });
  await page.locator("#quantity-input").fill(String(quantity));
  await page.getByRole("button", { name: "إضافة" }).click();
}
