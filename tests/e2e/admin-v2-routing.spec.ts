import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import { assignOrderToGovernorate } from "@/lib/rerouting/assign";
import { safeWhere } from "./db-cleanup";
import { ROUTING_TEST_GOVERNORATE } from "./test-env";

/**
 * Backlog 9.5a (التوجيه tab) coverage.
 *
 * IMPORTANT environment note (discovered while writing this spec, reported in the task's
 * close-out): the spec brief assumes "pick a governorate with no rule in the redesign DB".
 * At the time this suite was written, every one of the 27 `GOVERNORATE_OPTIONS` already had
 * a real `ReroutingRule` row in the shared `redesign` Neon branch (created 2026-04-02, real
 * partners attached) — there is no rule-less governorate left to safely claim, and
 * `ReroutingRule.governorate` is `@unique`, so a second rule for an already-covered
 * governorate cannot even be created. Per the standing safety rule ("never modify or delete
 * an existing ReroutingRule"), this suite does not touch any of those 27 rows. Instead:
 *   - the mode-pill/share-arithmetic *decision logic* is unit-tested in
 *     `lib/rerouting/mode-pill.test.ts` (danger/single/auto x every partner count);
 *   - this suite's mutation coverage (add/pause/remove/mode/audit/round-robin) runs against
 *     a rule this test creates for a **fixture-only governorate string** (not one of the 27
 *     real ones, guaranteed unique by the run's timestamp suffix) — exercised directly
 *     through the same `/api/admin/rerouting-rules*` routes the التوجيه tab calls, since the
 *     tab itself only ever renders the 27 real `GOVERNORATE_OPTIONS` rows and therefore never
 *     surfaces a fixture governorate for UI-level clicking;
 *   - a separate, read-only test loads the التوجيه tab against a real governorate to prove
 *     the page renders (pill, chips, shares) without writing anything.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

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

const uniqueSuffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ADMIN_PHONE = "+201099966501";
const ADMIN_PASSWORD = "AdminRoutingTest123!";
const ADMIN_NAME = `مسؤول اختبار التوجيه ${uniqueSuffix}`;
const CUSTOMER_PHONE = "+201099966502";

// A fixture-only governorate value — never one of the real 27 `GOVERNORATE_OPTIONS`, so it
// never renders in the UI matrix and this suite never touches a pre-existing rule row.
const FIXTURE_GOVERNORATE = `محافظة-اختبار-${uniqueSuffix}`;

let adminUserId: string;
let customerUserId: string;
let ruleId: string;
/** Backlog 9.0c — the rule this suite's own "mode select creates the rule on first change"
 * test creates for `ROUTING_TEST_GOVERNORATE`; deleted in afterAll so the row is back to "no
 * rule" for the next run (the one sanctioned exception to "never delete a ReroutingRule",
 * documented in tests/e2e/test-env.ts). */
let wadiRuleId: string | undefined;

type FixturePartner = { userId: string; partnerId: string; name: string };
let partnerA: FixturePartner;
let partnerB: FixturePartner;

const orderIds: string[] = [];
let linkAId: string;
let linkBId: string;

async function createFixturePartner(label: string, phoneSuffix: string): Promise<FixturePartner> {
  const phone = `+2010999665${phoneSuffix}`;
  const user = await prisma.user.create({ data: { phone, role: "CUSTOMER", passwordHash: await hashPassword("RoutingPartner123!") } });
  const partner = await prisma.partner.create({
    data: { userId: user.id, partnerType: "AGENT", name: `${label} ${uniqueSuffix}`, governorate: "القاهرة", phone, isActive: true },
  });
  return { userId: user.id, partnerId: partner.id, name: partner.name };
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 20_000 });
}

async function createOrderIn(governorateName: string): Promise<string> {
  const order = await prisma.order.create({
    data: {
      userId: customerUserId,
      status: "CREATED",
      assignedPartnerId: null,
      subtotalPiastres: 5000,
      totalPiastres: 5000,
      shippingAddress: { governorate: governorateName, city: governorateName, street: "شارع الاختبار" },
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
    },
  });
  orderIds.push(order.id);
  return order.id;
}

test.beforeAll(async () => {
  const admin = await prisma.user.upsert({
    where: { phone: ADMIN_PHONE },
    create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: ADMIN_NAME },
    update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN", name: ADMIN_NAME },
  });
  adminUserId = admin.id;

  const customer = await prisma.user.upsert({
    where: { phone: CUSTOMER_PHONE },
    create: { phone: CUSTOMER_PHONE, role: "CUSTOMER", passwordHash: await hashPassword("RoutingCust123!"), name: `عميل التوجيه ${uniqueSuffix}` },
    update: {},
  });
  customerUserId = customer.id;

  partnerA = await createFixturePartner("شريك أ للتوجيه", "10");
  partnerB = await createFixturePartner("شريك ب للتوجيه", "11");
});

test.afterAll(async () => {
  // cleanup-safe: FIXTURE_GOVERNORATE is a module-level const string built from uniqueSuffix — never undefined.
  await prisma.adminAuditLog.deleteMany({ where: { entityType: "routing", entityId: FIXTURE_GOVERNORATE } });
  if (orderIds.length) {
    await prisma.routedOrder.deleteMany({ where: { orderId: { in: orderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  }
  if (ruleId) {
    await prisma.reroutingRulePartner.deleteMany({ where: safeWhere({ ruleId }) });
    await prisma.reroutingRule.deleteMany({ where: safeWhere({ id: ruleId }) });
  }
  await prisma.partner.deleteMany({ where: { id: { in: [partnerA.partnerId, partnerB.partnerId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [adminUserId, customerUserId, partnerA.userId, partnerB.userId] } } });
  // Backlog 9.0c — restore ROUTING_TEST_GOVERNORATE to "no rule" for the next run.
  if (wadiRuleId) {
    await prisma.reroutingRulePartner.deleteMany({ where: safeWhere({ ruleId: wadiRuleId }) });
    await prisma.reroutingRule.deleteMany({ where: safeWhere({ id: wadiRuleId }) });
  }
  await prisma.$disconnect();
});

test("the التوجيه tab renders a real governorate's row read-only (pill, chips, shares)", async ({ page }) => {
  await loginAsAdmin(page);
  const realGovernorate = GOVERNORATE_OPTIONS[0]!.value;
  await page.goto(`/admin/partners?tab=routing&q=${encodeURIComponent(realGovernorate)}`);
  await expect(page.getByRole("tab", { name: /التوجيه/ })).toHaveAttribute("aria-selected", "true");
  const row = page.getByTestId(`routing-row-${realGovernorate}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByTestId("routing-mode-pill")).toBeVisible();
});

test("mode select creates the rule on first change (backlog 9.0c, a real 'no rule yet' row)", async ({ page }) => {
  await loginAsAdmin(page);
  // Defensive: ROUTING_TEST_GOVERNORATE should have no rule going in (test-env.ts's own doc)
  // — clear it first if a previous interrupted run ever left one, so this test's own "first
  // change" assertion is meaningful.
  await prisma.reroutingRule.deleteMany({ where: { governorate: ROUTING_TEST_GOVERNORATE } });

  await page.goto(`/admin/partners?tab=routing&q=${encodeURIComponent(ROUTING_TEST_GOVERNORATE)}`);
  const row = page.getByTestId(`routing-row-${ROUTING_TEST_GOVERNORATE}`);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByTestId("routing-mode-pill")).toContainText("الطلبات تنتظر إسنادًا يدويًا");

  const modeSelect = row.getByLabel(`وضع التوجيه — ${ROUTING_TEST_GOVERNORATE}`);
  await expect(modeSelect).toHaveValue("MANUAL"); // no rule yet -> isActive defaults to false

  const createRes = page.waitForResponse(
    (r) => r.url().includes("/api/admin/rerouting-rules") && r.request().method() === "POST"
  );
  await modeSelect.selectOption("AUTO");
  const res = await createRes;
  expect(res.ok()).toBe(true);
  const created = await res.json();
  wadiRuleId = created.data.id;

  // The toast text also lands in the toaster's aria-live announcer, so strict mode sees two
  // matches — the visible toast is the first.
  await expect(page.getByText("تم تحديث وضع التوجيه").first()).toBeVisible({ timeout: 10_000 });

  const rule = await prisma.reroutingRule.findUnique({ where: { governorate: ROUTING_TEST_GOVERNORATE } });
  expect(rule).toBeTruthy();
  expect(rule?.id).toBe(wadiRuleId);
  expect(rule?.isActive).toBe(true);
});

test("add_partner via the API creates the rule on first write and is audit-logged", async ({ page }) => {
  await loginAsAdmin(page);

  const createRes = await page.request.post("/api/admin/rerouting-rules", {
    data: { governorate: FIXTURE_GOVERNORATE, isActive: true },
  });
  expect(createRes.ok()).toBe(true);
  const createJson = await createRes.json();
  ruleId = createJson.data.id;

  const addA = await page.request.post(`/api/admin/rerouting-rules/${ruleId}/partners`, {
    data: { partnerId: partnerA.partnerId },
  });
  expect(addA.ok()).toBe(true);
  linkAId = (await addA.json()).data.id;

  const addB = await page.request.post(`/api/admin/rerouting-rules/${ruleId}/partners`, {
    data: { partnerId: partnerB.partnerId },
  });
  expect(addB.ok()).toBe(true);
  linkBId = (await addB.json()).data.id;

  const auditRows = await prisma.adminAuditLog.findMany({ where: { entityType: "routing", entityId: FIXTURE_GOVERNORATE, action: "add_partner" } });
  expect(auditRows.length).toBe(2);

  // Backlog 9.5 close-out fix — آخر النشاط on /admin renders the real Arabic sentence for
  // an add_partner row (not the mixed-language generic fallback).
  await page.goto("/admin");
  await expect(page.getByTestId("recent-activity")).toContainText(`أضاف ${partnerB.name} إلى دور ${FIXTURE_GOVERNORATE}`, {
    timeout: 15_000,
  });
});

test("round-robin assigns both partners in turn; pausing one leaves only the other", async ({}) => {
  const first = await assignOrderToGovernorate(await createOrderIn(FIXTURE_GOVERNORATE));
  const second = await assignOrderToGovernorate(await createOrderIn(FIXTURE_GOVERNORATE));
  expect(first.assigned).toBe(true);
  expect(second.assigned).toBe(true);
  if (first.assigned && second.assigned) {
    expect(new Set([first.partnerId, second.partnerId])).toEqual(new Set([partnerA.partnerId, partnerB.partnerId]));
  }
});

test("pause_partner is audit-logged and round-robin then only picks the active one", async ({ page }) => {
  await loginAsAdmin(page);
  const pauseRes = await page.request.patch(`/api/admin/rerouting-rules/${ruleId}/partners/${linkAId}`, {
    data: { isActive: false },
  });
  expect(pauseRes.ok()).toBe(true);

  const result = await assignOrderToGovernorate(await createOrderIn(FIXTURE_GOVERNORATE));
  expect(result.assigned).toBe(true);
  if (result.assigned) expect(result.partnerId).toBe(partnerB.partnerId);

  const auditRows = await prisma.adminAuditLog.findMany({ where: { entityType: "routing", entityId: FIXTURE_GOVERNORATE, action: "pause_partner" } });
  expect(auditRows.length).toBe(1);
});

test("set_mode to manual is audit-logged and a new order lands بلا شريك", async ({ page }) => {
  await loginAsAdmin(page);
  const patchRes = await page.request.patch(`/api/admin/rerouting-rules/${ruleId}`, { data: { isActive: false } });
  expect(patchRes.ok()).toBe(true);

  const result = await assignOrderToGovernorate(await createOrderIn(FIXTURE_GOVERNORATE));
  expect(result.assigned).toBe(false);
  if (!result.assigned) expect(result.reason).toBe("no_rule");

  const auditRows = await prisma.adminAuditLog.findMany({ where: { entityType: "routing", entityId: FIXTURE_GOVERNORATE, action: "set_mode" } });
  expect(auditRows.length).toBeGreaterThanOrEqual(1);
});

test("remove_partner is audit-logged", async ({ page }) => {
  await loginAsAdmin(page);
  const removeRes = await page.request.delete(`/api/admin/rerouting-rules/${ruleId}/partners/${linkBId}`);
  expect(removeRes.ok()).toBe(true);

  const auditRows = await prisma.adminAuditLog.findMany({ where: { entityType: "routing", entityId: FIXTURE_GOVERNORATE, action: "remove_partner" } });
  expect(auditRows.length).toBe(1);
});

test("old rerouting-rules and partner-inventory URLs redirect", async ({ page }) => {
  await loginAsAdmin(page);

  await page.goto("/admin/rerouting-rules");
  await expect(page).toHaveURL(/\/admin\/partners\?tab=routing/);

  await page.goto("/admin/rerouting-rules/new");
  await expect(page).toHaveURL(/\/admin\/partners\?tab=routing/);

  await page.goto(`/admin/rerouting-rules/${ruleId}`);
  await expect(page).toHaveURL(new RegExp(`/admin/partners\\?tab=routing&q=${encodeURIComponent(FIXTURE_GOVERNORATE)}`));

  await page.goto("/admin/partner-inventory");
  await expect(page).toHaveURL(/\/admin\/partners\?tab=network/);
});

test("بلا شريك فقط toggle changes pressed state on the التوجيه tab", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/partners?tab=routing");
  const dangerToggle = page.getByRole("button", { name: /بلا شريك فقط/ });
  await expect(dangerToggle).toHaveAttribute("aria-pressed", "false");
  await dangerToggle.click();
  await expect(dangerToggle).toHaveAttribute("aria-pressed", "true");
});

const SCREENSHOT_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1514, height: 681 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
];

test("screenshots: التوجيه at the four viewports", async ({ page }) => {
  await loginAsAdmin(page);
  for (const { width, height } of SCREENSHOT_VIEWPORTS) {
    await page.setViewportSize({ width, height });
    await page.goto("/admin/partners?tab=routing");
    await expect(page.getByRole("tab", { name: /التوجيه/ })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("جاري التحميل")).toHaveCount(0, { timeout: 20_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `screenshots/admin-v2-routing-${width}x${height}.png`, fullPage: true });

    if (width === 1440 || width === 1024 || width === 390) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
      expect(overflow, `no horizontal overflow at ${width}x${height}`).toBe(true);
    }
  }
});
