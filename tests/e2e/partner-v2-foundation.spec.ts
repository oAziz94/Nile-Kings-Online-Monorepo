import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import {
  seedPartnerPair,
  loginAs,
  cleanupPartnerPair,
  hashPassword,
  type PartnerFixturePair,
} from "./partner-fixtures";
// `@/lib/partner/resolve-threshold` transitively imports `@/lib/db`, which constructs a
// `PrismaClient` at module-evaluation time — importing it at the top of this file would run
// that construction during the hoisted import phase, *before* `loadRedesignTestEnv()` below
// has set `DATABASE_URL`/`DIRECT_URL` (the exact hazard `04-decisions.md`'s 2026-09-12
// incident is about). Deferred to a dynamic `import()` inside the one test that needs it,
// which runs at call time — safely after the guard below has already executed.

/**
 * Backlog 5.1 (Partner portal v2 — Foundation) regression coverage, per
 * `docs/redesign/03-backlog.md`'s 5.1 entry. Serial mode: one seeded fixture pair (with a
 * non-default cost rate for the receipt-cost assertions) shared across every test, plus one
 * admin test user, cleaned up once at the end.
 */
test.describe.configure({ mode: "serial" });

const prisma = new PrismaClient();
let pair: PartnerFixturePair;

const RUN_TAG = `e2e-5-1-${Date.now()}`;
const ADMIN_PHONE = `+2010${String(Date.now()).slice(-8)}`;
const ADMIN_PASSWORD = "AdminTest123!";
let adminUserId: string;

let categoryId: string;
let productId: string;
let factoryVariantId: string;

test.beforeAll(async () => {
  // Agent's cost rate is 7200 bps (72%) for the receipt-cost-snapshot assertions.
  pair = await seedPartnerPair(prisma, { agent: { costRateBps: 7200 } });

  const adminUser = await prisma.user.create({
    data: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD) },
  });
  adminUserId = adminUser.id;

  const category = await prisma.category.create({
    data: { name: `فئة 5.1 ${RUN_TAG}`, slug: `cat-5-1-${RUN_TAG}` },
  });
  categoryId = category.id;

  const product = await prisma.product.create({
    data: { categoryId, name: `منتج 5.1 ${RUN_TAG}`, slug: `p-5-1-${RUN_TAG}`, active: true },
  });
  productId = product.id;

  const variant = await prisma.variant.create({
    data: {
      productId,
      sku: `SKU-5-1-${RUN_TAG}`,
      name: "M",
      pricePiastres: 10000, // 100 EGP -> at 7200 bps, unit cost = 7200 piastres
      stockAvailable: 0,
      stockReserved: 0,
    },
  });
  factoryVariantId = variant.id;
});

test.afterAll(async () => {
  await prisma.partnerPayment.deleteMany({ where: { partnerId: pair.agent.partnerId } });
  await prisma.partnerStockThreshold.deleteMany({ where: { partnerId: pair.agent.partnerId } });
  await prisma.stockReceiptLine.deleteMany({ where: { receipt: { partnerId: pair.agent.partnerId } } });
  await prisma.stockReceipt.deleteMany({ where: { partnerId: pair.agent.partnerId } });
  await prisma.inventoryLedger.deleteMany({ where: { partnerId: pair.agent.partnerId } });
  await prisma.partnerInventory.deleteMany({ where: { partnerId: pair.agent.partnerId } });
  await prisma.variant.deleteMany({ where: { productId } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.delete({ where: { id: categoryId } });
  await cleanupPartnerPair(prisma, pair);
  await prisma.user.delete({ where: { id: adminUserId } });
  await prisma.$disconnect();
});

test("both roles see the v2 nav", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner");
  const agentNav = page.getByRole("navigation", { name: "التنقل في لوحة الشريك" });
  for (const label of ["اليوم", "الطلبات", "المخزون", "الموزعون", "التقارير", "الإعدادات"]) {
    await expect(agentNav.getByRole("link", { name: label })).toBeVisible();
  }

  await page.context().clearCookies();
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner");
  const distributorNav = page.getByRole("navigation", { name: "التنقل في لوحة الشريك" });
  for (const label of ["اليوم", "الطلبات", "المخزون", "التقارير", "الإعدادات"]) {
    await expect(distributorNav.getByRole("link", { name: label })).toBeVisible();
  }
  await expect(distributorNav.getByRole("link", { name: "الموزعون" })).toHaveCount(0);
});

test("every old partner route redirects to its v2 home", async ({ page }) => {
  // Backlog 5.4 added several newly-compiled destination routes (the stock hub's tabs) —
  // cold Turbopack compiles across eight sequential `goto`s can outlast the default 30s.
  test.setTimeout(90_000);
  await loginAs(page, pair, "AGENT");

  // Backlog 5.4 landed the stock hub's tabs — the placeholder-era "everything redirects to
  // the bare /partner/stock stub" targets from 5.1 are superseded by the real per-tab
  // targets below (task text: "update the 5.1 redirects to land on the right tab").
  const cases: [string, string][] = [
    ["/partner/routed-orders", "/partner/orders"],
    ["/partner/products", "/partner/stock"],
    ["/partner/receipts", "/partner/stock/intake"],
    ["/partner/receipts/new", "/partner/stock/intake/new"],
    ["/partner/restock-requests", "/partner/stock/requests"],
    ["/partner/distributor-requests", "/partner/stock/requests"],
    ["/partner/distributors", "/partner/network"],
    ["/partner/reports", "/partner/reports/sales"],
  ];
  for (const [from, to] of cases) {
    await page.goto(from, { timeout: 20_000 });
    await expect(page).toHaveURL(new RegExp(`${to.replace(/\//g, "\\/")}$`), { timeout: 15_000 });
  }
});

test("settings sections save and reload", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  await page.goto("/partner/settings");

  await page.getByRole("button", { name: "الأحد" }).click(); // toggle a working day off
  const capacityInput = page.getByLabel("الطاقة اليومية (طلب)");
  await capacityInput.fill("33");
  await page.getByRole("button", { name: "حفظ" }).first().click();
  await expect(page.getByText("تم حفظ ملف العمل").first()).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("الطاقة اليومية (طلب)")).toHaveValue("33");
  await expect(page.getByRole("button", { name: "الأحد" })).toHaveAttribute("aria-pressed", "false");
});

test("a product threshold beats a category one beats the default in resolveThreshold", async () => {
  const { resolveThreshold } = await import("../../lib/partner/resolve-threshold");
  const partnerId = pair.agent.partnerId;
  await prisma.partner.update({ where: { id: partnerId }, data: { lowStockThreshold: 5 } });

  let lookup = await resolveThreshold(partnerId);
  expect(lookup.forVariant({ productId, categoryId })).toBe(5);

  await prisma.partnerStockThreshold.create({ data: { partnerId, categoryId, threshold: 8 } });
  lookup = await resolveThreshold(partnerId);
  expect(lookup.forVariant({ productId, categoryId })).toBe(8);

  await prisma.partnerStockThreshold.create({ data: { partnerId, productId, threshold: 12 } });
  lookup = await resolveThreshold(partnerId);
  expect(lookup.forVariant({ productId, categoryId })).toBe(12);

  await prisma.partnerStockThreshold.deleteMany({ where: { partnerId } });
});

test("a FACTORY receipt snapshots unitCostPiastres/totalCostPiastres, a COUNT leaves both null", async ({ page }) => {
  await loginAs(page, pair, "AGENT");

  const factoryRes = await page.request.post("/api/partner/receipts", {
    data: { kind: "FACTORY", lines: [{ variantId: factoryVariantId, quantity: 3 }] },
  });
  expect(factoryRes.ok()).toBeTruthy();
  const factoryJson = await factoryRes.json();
  const factoryReceiptId = factoryJson.data.id as string;

  const factoryReceipt = await prisma.stockReceipt.findUniqueOrThrow({
    where: { id: factoryReceiptId },
    include: { lines: true },
  });
  // pricePiastres 10000 * 7200 bps / 10000 = 7200 piastres/unit * 3 units = 21600.
  expect(factoryReceipt.lines[0].unitCostPiastres).toBe(7200);
  expect(factoryReceipt.totalCostPiastres).toBe(21600);

  const countRes = await page.request.post("/api/partner/receipts", {
    data: { kind: "COUNT", lines: [{ variantId: factoryVariantId, quantity: 3 }] },
  });
  expect(countRes.ok()).toBeTruthy();
  const countJson = await countRes.json();
  const countReceipt = await prisma.stockReceipt.findUniqueOrThrow({
    where: { id: countJson.data.id },
    include: { lines: true },
  });
  expect(countReceipt.lines[0].unitCostPiastres).toBeNull();
  expect(countReceipt.totalCostPiastres).toBeNull();
});

test("a partner PATCH carrying costRateBps is rejected with 400", async ({ page }) => {
  await loginAs(page, pair, "AGENT");
  const res = await page.request.patch("/api/partner/settings", {
    data: { costRateBps: 9999 },
  });
  expect(res.status()).toBe(400);
});

test("admin records an installment and the partner reads it", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });

  const paymentRes = await page.request.post(`/api/admin/partners/${pair.agent.partnerId}/payments`, {
    data: {
      kind: "INSTALLMENT",
      amountPiastres: 500000,
      paidAt: new Date().toISOString(),
      reference: RUN_TAG,
    },
  });
  expect(paymentRes.ok()).toBeTruthy();

  await page.context().clearCookies();
  await loginAs(page, pair, "AGENT");
  const partnerRes = await page.request.get("/api/partner/payments");
  expect(partnerRes.ok()).toBeTruthy();
  const partnerJson = await partnerRes.json();
  const found = (partnerJson.data.payments as { reference: string | null; amountPiastres: number }[]).find(
    (p) => p.reference === RUN_TAG
  );
  expect(found).toBeTruthy();
  expect(found?.amountPiastres).toBe(500000);
});
