import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import {
  seedPartnerPair,
  loginAs,
  cleanupPartnerPair,
  hashPassword,
  loginWithPhone,
  type PartnerFixturePair,
} from "./partner-fixtures";

// Backlog 4.21 (Distributors roster, agent) regression coverage, per
// docs/redesign/00-feature-inventory/partner/distributors.md: the agent sees the fixture
// distributor with contact/status/inventory numbers matching Prisma directly, and a
// distributor visiting the route gets the explicit role-gate panel, never the table.
test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
let pair: PartnerFixturePair;
let variantId: string;

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma);

  const variant = await prisma.variant.findFirst({ select: { id: true } });
  if (!variant) throw new Error("no variant found to seed PartnerInventory for the test");
  variantId = variant.id;

  await prisma.partnerInventory.create({
    data: {
      partnerId: pair.distributor.partnerId,
      variantId,
      stockAvailable: 40,
      stockReserved: 15,
    },
  });
});

test.afterAll(async () => {
  await prisma.partnerInventory.deleteMany({ where: { partnerId: pair.distributor.partnerId, variantId } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.$disconnect();
});

test("agent sees the fixture distributor with inventory numbers matching Prisma", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/distributors");

  const row = page.locator("tr", { hasText: pair.distributor.name });
  await expect(row).toBeVisible();

  // Status pill: fixture distributor is isActive: true.
  await expect(row.getByText("نشط", { exact: true })).toBeVisible();

  // Inventory totals: sellable = max(0, available - reserved).
  const totals = await prisma.partnerInventory.aggregate({
    where: { partnerId: pair.distributor.partnerId },
    _sum: { stockAvailable: true, stockReserved: true },
  });
  const available = totals._sum.stockAvailable ?? 0;
  const reserved = totals._sum.stockReserved ?? 0;
  const sellable = Math.max(0, available - reserved);

  await expect(row.getByText(`متاح: ${available}`)).toBeVisible();
  await expect(row.getByText(`محجوز: ${reserved}`)).toBeVisible();
  await expect(row.getByText(`قابل للبيع: ${sellable}`)).toBeVisible();

  // Governorate and phone (dir=ltr, unformatted E.164) render as stored.
  await expect(row).toContainText("الجيزة");
  await expect(row).toContainText(pair.distributor.phone);
});

test("distributor visiting the roster gets the role-gate panel, not an empty table", async ({ page }) => {
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner/distributors");
  await expect(page.getByText("هذه الصفحة متاحة للوكلاء فقط")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("empty state renders when the agent has no linked distributors", async ({ page }) => {
  // A fresh agent (no seeded distributor) sees the empty-state copy, not a stale/loading table.
  const password = "SoloAgentTest123!";
  const passwordHash = await hashPassword(password);
  const localPhone = `10${Date.now().toString().slice(-8)}`;
  const phone = `+20${localPhone}`;
  const user = await prisma.user.create({
    data: { phone, role: "CUSTOMER", passwordHash },
  });
  const partner = await prisma.partner.create({
    data: {
      userId: user.id,
      partnerType: "AGENT",
      name: "وكيل بلا موزعين",
      governorate: "القاهرة",
      phone,
      isActive: true,
    },
  });

  try {
    await loginWithPhone(page, localPhone, password);
    await page.goto("/partner/distributors");
    await expect(page.getByText("لا يوجد موزعون مرتبطون بعد")).toBeVisible();
    await expect(page.getByRole("table")).toHaveCount(0);
  } finally {
    await prisma.partner.deleteMany({ where: { id: partner.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});
