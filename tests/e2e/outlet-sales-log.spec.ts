import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { seedPartnerPair, cleanupPartnerPair, loginAs, type PartnerFixturePair } from "./partner-fixtures";
import { safeWhere } from "./db-cleanup";
import { cairoDateIso, cairoStartOfDayUtc } from "../../lib/analytics/cairo-day";

/**
 * Backlog 11.4 (sales log, reopen/reprint, void). Fixtures are this spec's own: an AGENT + outlet
 * pair, one category / product / two variants stocked at the outlet, an admin user, and three
 * StoreSales written through Prisma with `soldAt` set (2 today, 1 yesterday, Cairo days):
 *   #1 today  CASH     v1 x2 (200 EGP, customer "منى")
 *   #2 today  INSTAPAY v2 x1 (250 EGP, phone 01012345678)
 *   #3 yesterday CARD  v1 x1 (100 EGP)
 * Stock is seeded as already reduced by those sales (v1 7, v2 9). Cleanup is by id.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

const prisma = new PrismaClient();
const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
const ADMIN_PHONE = "+201099966411";
const ADMIN_PASSWORD = "SalesLogAdmin123!";

let pair: PartnerFixturePair;
let adminUserId: string;
let categoryId: string;
let productId: string;
let v1: string;
let v2: string;
const saleIds: Record<1 | 2 | 3, string> = { 1: "", 2: "", 3: "" };

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}
async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${(await scryptAsync(plain, salt)).toString("hex")}`;
}

async function stock(variantId: string) {
  return prisma.partnerInventory.findUniqueOrThrow({
    where: { partnerId_variantId: { partnerId: pair.distributor.partnerId, variantId } },
  });
}

async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(ADMIN_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/admin", { timeout: 20_000 });
}

test.beforeAll(async () => {
  adminUserId = (
    await prisma.user.upsert({
      where: { phone: ADMIN_PHONE },
      create: { phone: ADMIN_PHONE, role: "ADMIN", passwordHash: await hashPassword(ADMIN_PASSWORD), name: "مسؤول سجل المبيعات" },
      update: { passwordHash: await hashPassword(ADMIN_PASSWORD), role: "ADMIN" },
    })
  ).id;

  pair = await seedPartnerPair(prisma);
  const partnerId = pair.distributor.partnerId;
  categoryId = (await prisma.category.create({ data: { name: `فئة سجل ${suffix}`, slug: `slog-cat-${suffix}` } })).id;
  productId = (
    await prisma.product.create({ data: { categoryId, name: `منتج سجل ${suffix}`, slug: `slog-product-${suffix}`, active: true } })
  ).id;
  v1 = (await prisma.variant.create({ data: { productId, sku: `SLOG-A-${suffix}`, name: "M", colorName: "أحمر", pricePiastres: 10000 } })).id;
  v2 = (await prisma.variant.create({ data: { productId, sku: `SLOG-B-${suffix}`, name: "L", colorName: "أزرق", pricePiastres: 25000 } })).id;
  await prisma.partnerInventory.create({ data: { partnerId, variantId: v1, stockAvailable: 7, stockReserved: 0 } });
  await prisma.partnerInventory.create({ data: { partnerId, variantId: v2, stockAvailable: 9, stockReserved: 0 } });

  const now = new Date();
  const yesterday = new Date(cairoStartOfDayUtc(cairoDateIso(now)).getTime() - 3 * 3_600_000);
  const line = (variantId: string, sku: string, size: string, colour: string, quantity: number, unitPricePiastres: number) => ({
    variantId,
    quantity,
    unitPricePiastres,
    productName: `منتج سجل ${suffix}`,
    variantName: `${size} – ${colour}`,
    sku,
  });
  const mk = async (
    n: 1 | 2 | 3,
    data: { paymentMethod: "CASH" | "INSTAPAY" | "CARD"; soldAt: Date; subtotalPiastres: number; customerName?: string; customerPhone?: string },
    items: ReturnType<typeof line>[]
  ) => {
    saleIds[n] = (
      await prisma.storeSale.create({
        data: { partnerId, receiptNo: n, recordedByUserId: pair.distributor.userId, ...data, items: { create: items } },
      })
    ).id;
  };
  await mk(1, { paymentMethod: "CASH", soldAt: new Date(now.getTime() - 60_000), subtotalPiastres: 20000, customerName: "منى" }, [
    line(v1, `SLOG-A-${suffix}`, "M", "أحمر", 2, 10000),
  ]);
  await mk(2, { paymentMethod: "INSTAPAY", soldAt: now, subtotalPiastres: 25000, customerPhone: "+201012345678" }, [
    line(v2, `SLOG-B-${suffix}`, "L", "أزرق", 1, 25000),
  ]);
  await mk(3, { paymentMethod: "CARD", soldAt: yesterday, subtotalPiastres: 10000 }, [
    line(v1, `SLOG-A-${suffix}`, "M", "أحمر", 1, 10000),
  ]);
});

test.afterAll(async () => {
  const partnerId = pair.distributor.partnerId;
  await prisma.adminAuditLog.deleteMany({
    where: safeWhere({ OR: [{ actorUserId: adminUserId }, { entityId: { in: Object.values(saleIds).filter(Boolean) } }] }),
  });
  await prisma.storeSaleItem.deleteMany({ where: safeWhere({ sale: { partnerId } }) });
  await prisma.storeSale.deleteMany({ where: safeWhere({ partnerId }) });
  await prisma.inventoryLedger.deleteMany({ where: safeWhere({ variantId: { in: [v1, v2] } }) });
  await prisma.partnerInventory.deleteMany({ where: safeWhere({ variantId: { in: [v1, v2] } }) });
  await prisma.variant.deleteMany({ where: safeWhere({ id: { in: [v1, v2] } }) });
  await prisma.product.deleteMany({ where: safeWhere({ id: productId }) });
  await prisma.category.deleteMany({ where: safeWhere({ id: categoryId }) });
  await cleanupPartnerPair(prisma, pair);
  await prisma.user.deleteMany({ where: safeWhere({ id: adminUserId }) });
  await prisma.$disconnect();
});

const row = (page: Page, n: number) => page.locator(`[data-testid="sale-row"][data-receipt="${n}"]`);

test("log lists today's sales with totals, presets, payment filter and search (desktop table, phone cards)", async ({ page }) => {
  await page.setViewportSize({ width: 1514, height: 681 });
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner/sales");

  await expect(page.getByTestId("kpi-count")).toHaveText("2");
  await expect(page.getByTestId("kpi-revenue")).toHaveText("450");
  await expect(page.getByTestId("kpi-voided")).toHaveText("0");
  await expect(page.getByTestId("sale-row")).toHaveCount(2);
  await expect(row(page, 1)).toContainText("نقدي");
  await expect(row(page, 2)).toContainText("إنستاباي");
  // newest first: #2 above #1
  expect(await page.getByTestId("sale-row").first().getAttribute("data-receipt")).toBe("2");

  await page.getByRole("radio", { name: "أمس" }).click();
  await expect(page.getByTestId("sale-row")).toHaveCount(1);
  await expect(row(page, 3)).toContainText("بطاقة");
  await expect(page.getByTestId("kpi-revenue")).toHaveText("100");

  await page.getByRole("radio", { name: "7 أيام" }).click();
  await expect(page.getByTestId("kpi-count")).toHaveText("3");
  await expect(page.getByTestId("kpi-revenue")).toHaveText("550");

  await page.getByRole("radio", { name: "إنستاباي" }).click();
  await expect(page.getByTestId("sale-row")).toHaveCount(1);
  await expect(row(page, 2)).toBeVisible();
  await page.getByRole("radio", { name: "الكل" }).click();
  await expect(page.getByTestId("sale-row")).toHaveCount(3);

  await page.getByTestId("sales-search").fill("3");
  await expect(page.getByTestId("sale-row")).toHaveCount(1);
  await expect(row(page, 3)).toBeVisible();
  await page.getByTestId("sales-search").fill("منى");
  await expect(page.getByTestId("sale-row")).toHaveCount(1);
  await expect(row(page, 1)).toBeVisible();
  await page.getByTestId("sales-search").fill("01012345678");
  await expect(page.getByTestId("sale-row")).toHaveCount(1);
  await expect(row(page, 2)).toBeVisible();

  // phone: cards instead of the table
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("sale-card")).toHaveCount(1);
  await expect(page.getByTestId("sales-table")).toBeHidden();
  await page.getByTestId("sales-search").fill("");
  await expect(page.getByTestId("sale-card")).toHaveCount(3);
});

test("voiding today's receipt from the UI puts stock back, writes the ledger, shows badge and reason, drops the KPI", async ({ page }) => {
  await page.setViewportSize({ width: 1514, height: 681 });
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto("/partner/sales");
  await row(page, 1).getByRole("link").click();
  await expect(page).toHaveURL(new RegExp(`/partner/sales/${saleIds[1]}$`));
  await expect(page.getByRole("heading", { name: "إيصال رقم 1" })).toBeVisible();

  await page.getByTestId("void-open").click();
  await expect(page.getByTestId("void-confirm")).toBeDisabled();
  await page.getByTestId("void-reason").fill("ab");
  await expect(page.getByTestId("void-confirm")).toBeDisabled();
  await page.getByTestId("void-reason").fill("أخطأت في الصنف");
  await page.getByTestId("void-confirm").click();

  await expect(page.getByTestId("void-info")).toContainText("هذا الإيصال ملغي", { timeout: 20_000 });
  await expect(page.getByTestId("void-reason-text")).toHaveText("أخطأت في الصنف");
  await expect(page.getByTestId("void-open")).toHaveCount(0);

  // 11.9: the voided slip must not grow wider than itself under print (the rotated "ملغي" watermark
  // once widened the 80 mm page by ~97 px each side).
  await page.emulateMedia({ media: "print" });
  await expect(page.getByTestId("receipt-slip")).toContainText("ملغي");
  const widths = await page.evaluate(() => {
    const s = document.querySelector("[data-testid=receipt-slip]") as HTMLElement;
    return { scroll: s.scrollWidth, client: s.clientWidth, doc: document.documentElement.scrollWidth, win: window.innerWidth };
  });
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  expect(widths.doc).toBeLessThanOrEqual(widths.win);
  await page.emulateMedia({ media: "screen" });

  expect((await stock(v1)).stockAvailable).toBe(9);
  const sale = await prisma.storeSale.findUniqueOrThrow({ where: { id: saleIds[1] } });
  expect(sale.status).toBe("VOIDED");
  expect(sale.voidReason).toBe("أخطأت في الصنف");
  expect(sale.voidedAt).not.toBeNull();
  const ledger = await prisma.inventoryLedger.findMany({ where: { partnerId: pair.distributor.partnerId, reason: "STORE_SALE_VOID" } });
  expect(ledger).toHaveLength(1);
  expect(ledger[0].quantityAvailableDelta).toBe(2);
  expect(ledger[0].quantityReservedDelta).toBe(0);
  expect(ledger[0].notes).toBe(`store-sale-void:${saleIds[1]} · إيصال 1`);

  // voiding twice is refused and writes nothing more
  const again = await page.request.post(`/api/partner/sales/${saleIds[1]}/void`, { data: { reason: "مرة ثانية" } });
  expect(again.status()).toBe(409);
  expect((await stock(v1)).stockAvailable).toBe(9);

  await page.goto("/partner/sales");
  await expect(page.getByTestId("kpi-count")).toHaveText("1");
  await expect(page.getByTestId("kpi-revenue")).toHaveText("250");
  await expect(page.getByTestId("kpi-voided")).toHaveText("1");
  await expect(row(page, 1).getByTestId("void-badge")).toBeVisible();
});

test("yesterday's receipt cannot be voided by the outlet: button disabled with a hint, API 403", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, pair, "DISTRIBUTOR");
  await page.goto(`/partner/sales/${saleIds[3]}`);
  await expect(page.getByRole("heading", { name: "إيصال رقم 3" })).toBeVisible();
  await expect(page.getByTestId("void-open")).toBeDisabled();
  await expect(page.getByTestId("void-hint")).toContainText("يمكن إلغاء إيصال اليوم فقط");

  const res = await page.request.post(`/api/partner/sales/${saleIds[3]}/void`, { data: { reason: "محاولة" } });
  expect(res.status()).toBe(403);
  expect((await res.json()).error.message).toBe("يمكن إلغاء إيصال اليوم فقط");
  const bad = await page.request.post(`/api/partner/sales/${saleIds[2]}/void`, { data: { reason: "x" } });
  expect(bad.status()).toBe(400);

  expect((await prisma.storeSale.findUniqueOrThrow({ where: { id: saleIds[3] } })).status).toBe("COMPLETED");
  expect((await stock(v1)).stockAvailable).toBe(9);
  expect((await stock(v2)).stockAvailable).toBe(9);

  // an agent cannot use the outlet routes
  await page.context().clearCookies();
  await loginAs(page, pair, "AGENT");
  expect((await page.request.post(`/api/partner/sales/${saleIds[2]}/void`, { data: { reason: "وكيل" } })).status()).toBe(403);
  expect((await page.request.get("/api/partner/sales")).status()).toBe(403);
});

test("the admin can void yesterday's receipt through the admin API and it is audited", async ({ page }) => {
  await loginAsAdmin(page);
  const url = `/api/admin/partners/${pair.distributor.partnerId}/sales/${saleIds[3]}/void`;
  expect((await page.request.post(url, { data: { reason: "" } })).status()).toBe(400);

  const res = await page.request.post(url, { data: { reason: "إلغاء من الإدارة" } });
  expect(res.status()).toBe(200);
  expect((await res.json()).data.sale.status).toBe("VOIDED");

  expect((await stock(v1)).stockAvailable).toBe(10);
  const sale = await prisma.storeSale.findUniqueOrThrow({ where: { id: saleIds[3] } });
  expect(sale.status).toBe("VOIDED");
  expect(sale.voidReason).toBe("إلغاء من الإدارة");
  const audit = await prisma.adminAuditLog.findMany({ where: { entityId: saleIds[3], action: "void_sale" } });
  expect(audit).toHaveLength(1);
  expect(audit[0].actorUserId).toBe(adminUserId);
  expect(audit[0].reason).toBe("إلغاء من الإدارة");
  expect(audit[0].entityType).toBe("StoreSale");

  // second time: already voided
  expect((await page.request.post(url, { data: { reason: "مرة ثانية" } })).status()).toBe(409);
  // unknown sale
  expect(
    (await page.request.post(`/api/admin/partners/${pair.distributor.partnerId}/sales/nope/void`, { data: { reason: "سبب" } })).status()
  ).toBe(404);
});

test("a non-admin is refused on the admin void route", async ({ page }) => {
  await loginAs(page, pair, "DISTRIBUTOR");
  const res = await page.request.post(`/api/admin/partners/${pair.distributor.partnerId}/sales/${saleIds[2]}/void`, {
    data: { reason: "سبب" },
  });
  expect([401, 403]).toContain(res.status());
  expect((await prisma.storeSale.findUniqueOrThrow({ where: { id: saleIds[2] } })).status).toBe("COMPLETED");
});
