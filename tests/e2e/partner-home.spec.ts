import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

/**
 * Backlog 4.17 (partner home, in-app alerts, settings) regression coverage. Serial mode:
 * all three tests share one seeded fixture pair (plus one seeded low-stock inventory row),
 * cleaned up once at the end.
 */
test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
let pair: PartnerFixturePair;
let lowStockVariantId: string;

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma);
  const variant = await prisma.variant.findFirst({
    where: { product: { active: true } },
    select: { id: true },
  });
  if (!variant) throw new Error("No active product variant found to seed low-stock inventory against.");
  lowStockVariantId = variant.id;
});

test.afterAll(async () => {
  await prisma.partnerInventory.deleteMany({
    where: { partnerId: pair.agent.partnerId, variantId: lowStockVariantId },
  });
  await prisma.inventoryLedger.deleteMany({ where: { partnerId: pair.agent.partnerId } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.$disconnect();
});

test("both roles land on /partner and see their tiles; counts equal the API", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner");
  await expect(page.getByRole("heading", { name: "النظرة العامة" })).toBeVisible();

  const agentApi = await page.request.get("/api/partner/dashboard");
  expect(agentApi.ok()).toBe(true);
  const agentData = (await agentApi.json()).data;

  await expect(page.getByTestId("kpi-created")).toContainText(String(agentData.orders.CREATED));
  await expect(page.getByTestId("kpi-confirmed")).toContainText(String(agentData.orders.CONFIRMED));
  await expect(page.getByTestId("kpi-processing")).toContainText(String(agentData.orders.PROCESSING));
  await expect(page.getByTestId("kpi-ready")).toContainText(String(agentData.orders.READY_TO_SHIP));
  // Agent-only line.
  await expect(page.getByText("الموزعون النشطون المرتبطون بحسابك")).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner");
  await expect(page.getByRole("heading", { name: "النظرة العامة" })).toBeVisible();

  const distApi = await page.request.get("/api/partner/dashboard");
  expect(distApi.ok()).toBe(true);
  const distData = (await distApi.json()).data;
  expect(distData.partnerType).toBe("DISTRIBUTOR");
  await expect(page.getByTestId("kpi-created")).toContainText(String(distData.orders.CREATED));
  // Distributor has no agent-only line.
  await expect(page.getByText("الموزعون النشطون المرتبطون بحسابك")).toHaveCount(0);
});

test("the bell shows an unseen low-stock alert after seeding a line under the threshold, and clears after opening", async ({
  page,
}) => {
  await page.context().clearCookies();
  await loginAs(page, pair, "AGENT");

  // Seed a low-stock line (default threshold is 5; sellable 2 <= 5).
  await prisma.partnerInventory.create({
    data: { partnerId: pair.agent.partnerId, variantId: lowStockVariantId, stockAvailable: 2, stockReserved: 0 },
  });

  await page.goto("/partner");
  await page.reload();

  const bellTrigger = page.getByRole("button", { name: /الإشعارات/ });
  await expect(bellTrigger).toHaveAccessibleName(/غير مقروء/);

  await bellTrigger.click();
  await expect(page.getByText(/مخزون منخفض/).first()).toBeVisible();

  // Opening the popover marks everything seen server-side.
  await expect
    .poll(async () => {
      const res = await page.request.get("/api/partner/alerts");
      const json = await res.json();
      return json.data.unseenCount;
    })
    .toBe(0);

  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("button", { name: /الإشعارات/ })).not.toHaveAccessibleName(/غير مقروء/);
});

test("the threshold saves and changes the home count", async ({ page }) => {
  await page.context().clearCookies();
  await loginAs(page, pair, "AGENT");

  await page.goto("/partner");
  await expect(page.getByTestId("low-stock-count")).toHaveText("1");

  // Settings page rebuilt to the v2 sectioned layout (backlog 5.1) — the threshold field
  // is now "الحد الافتراضي" inside the "حدود المخزون" panel, saved with its own
  // (uniquely-labelled) button rather than the old single-field form.
  await page.goto("/partner/settings");
  const input = page.getByLabel("الحد الافتراضي", { exact: true });
  await expect(input).toHaveValue("5");
  await input.fill("1");
  await page.getByRole("button", { name: "حفظ الحد الافتراضي" }).click();
  await expect(page.getByText("تم حفظ الحد الافتراضي", { exact: true })).toBeVisible();

  await page.goto("/partner");
  await expect(page.getByTestId("low-stock-count")).toHaveText("0");

  // Restore for a clean afterAll (not strictly required, but keeps the fixture partner's
  // settings at the default for anyone re-running against the same seeded partner).
  await page.goto("/partner/settings");
  await page.getByLabel("الحد الافتراضي", { exact: true }).fill("5");
  await page.getByRole("button", { name: "حفظ الحد الافتراضي" }).click();
});
