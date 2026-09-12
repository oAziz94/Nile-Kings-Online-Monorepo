import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

// Backlog 4.16 (Partner shell foundation), nav assertions updated to the v2 nav per
// backlog 5.1 (`05-partner-portal-v2.md` §2 information architecture) — the shell's own
// contract (nav-set-per-role, the mobile drawer's open/close + focus return, logout) is
// otherwise unchanged. Serial mode: both tests share one seeded fixture pair, cleaned up once.
test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
let pair: PartnerFixturePair;

test.beforeAll(async () => {
  pair = await seedPartnerPair(prisma);
});

test.afterAll(async () => {
  await cleanupPartnerPair(prisma, pair);
  await prisma.$disconnect();
});

test("agent sees the agent nav set, distributor sees the distributor nav set", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/stock");
  const agentNav = page.getByRole("navigation", { name: "التنقل في لوحة الشريك" });
  await expect(agentNav.getByRole("link", { name: "اليوم" })).toBeVisible();
  await expect(agentNav.getByRole("link", { name: "الطلبات" })).toBeVisible();
  await expect(agentNav.getByRole("link", { name: "المخزون" })).toBeVisible();
  await expect(agentNav.getByRole("link", { name: "الموزعون" })).toBeVisible();
  await expect(agentNav.getByRole("link", { name: "التقارير" })).toBeVisible();

  await page.context().clearCookies();
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner/stock");
  const distributorNav = page.getByRole("navigation", { name: "التنقل في لوحة الشريك" });
  await expect(distributorNav.getByRole("link", { name: "اليوم" })).toBeVisible();
  await expect(distributorNav.getByRole("link", { name: "الطلبات" })).toBeVisible();
  await expect(distributorNav.getByRole("link", { name: "المخزون" })).toBeVisible();
  await expect(distributorNav.getByRole("link", { name: "الموزعون" })).toHaveCount(0);
  await expect(distributorNav.getByRole("link", { name: "التقارير" })).toBeVisible();
});

test("mobile drawer opens/closes at 390px with focus returning to the trigger, and logout lands on /login", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/stock");

  const trigger = page.getByRole("button", { name: "فتح قائمة لوحة الشريك" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const drawerNav = page.getByRole("navigation", { name: "التنقل في لوحة الشريك" });
  await expect(drawerNav.getByRole("link", { name: "المخزون" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawerNav).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await drawerNav.getByRole("button", { name: "تسجيل الخروج" }).click();
  await page.waitForURL("**/login");
  expect(new URL(page.url()).pathname).toBe("/login");
});
