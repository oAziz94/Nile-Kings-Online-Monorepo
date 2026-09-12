import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import { seedPartnerPair, loginAs, cleanupPartnerPair, type PartnerFixturePair } from "./partner-fixtures";

// Backlog 4.16 (Partner shell foundation) regression coverage. Covers the shell's own
// contract — nav-set-per-role, the mobile drawer's open/close + focus return, and logout —
// per docs/redesign/00-feature-inventory/partner/dashboard.md's `PartnerShell` section and
// backlog 4.16's brief. Serial mode: both tests share one seeded fixture pair, cleaned up once.
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
  await page.goto("/partner/products");
  const agentNav = page.getByRole("navigation", { name: "التنقل في لوحة الشريك" });
  await expect(agentNav.getByRole("link", { name: "الموزعون" })).toBeVisible();
  await expect(agentNav.getByRole("link", { name: "طلبات الموزعين" })).toBeVisible();
  await expect(agentNav.getByRole("link", { name: "طلب إعادة توريد" })).toHaveCount(0);

  await page.context().clearCookies();
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner/products");
  const distributorNav = page.getByRole("navigation", { name: "التنقل في لوحة الشريك" });
  await expect(distributorNav.getByRole("link", { name: "طلب إعادة توريد" })).toBeVisible();
  await expect(distributorNav.getByRole("link", { name: "الموزعون" })).toHaveCount(0);
  await expect(distributorNav.getByRole("link", { name: "طلبات الموزعين" })).toHaveCount(0);
});

test("mobile drawer opens/closes at 390px with focus returning to the trigger, and logout lands on /login", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/products");

  const trigger = page.getByRole("button", { name: "فتح قائمة لوحة الشريك" });
  await expect(trigger).toBeVisible();
  await trigger.click();

  const drawerNav = page.getByRole("navigation", { name: "التنقل في لوحة الشريك" });
  await expect(drawerNav.getByRole("link", { name: "مخزون المنتجات" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawerNav).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await drawerNav.getByRole("button", { name: "تسجيل الخروج" }).click();
  await page.waitForURL("**/login");
  expect(new URL(page.url()).pathname).toBe("/login");
});
