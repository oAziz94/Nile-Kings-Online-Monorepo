/**
 * Backlog 9.6 standing deliverable — two-server equivalence for partner-facing code. Seeds
 * one partner (agent), captures the five partner report JSON bodies for a fixed preset plus
 * the `<main>` outerHTML of `/partner/reports/sales` and `/partner/reports/money` at
 * 1440x900, from both the "before" server (main working tree, port 3172, unmodified) and the
 * "after" server (this worktree, port 3166), diffs them, and cleans up the fixture.
 *
 * Safety: constructs a PrismaClient — run only as
 *   node --env-file=.env.redesign <tsx-cli> scripts/reports-9-6-equivalence.ts
 * from the worktree root. Asserts the loaded DATABASE_URL host is the redesign branch before
 * doing anything else (mirrors tests/e2e/test-env.ts's guard). Cleans up the one partner/user/
 * category/product/variant/order it creates; touches nothing else.
 */
import { PrismaClient } from "@prisma/client";
import { chromium } from "@playwright/test";
import crypto from "node:crypto";
import fs from "node:fs";

const PRODUCTION_DB_HOST_PREFIX = "ep-hidden-butterfly-agp3sg0e";
const REDESIGN_DB_HOST_PREFIX = "ep-mute-poetry-agss66i6";

function assertNotProduction(): void {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const host = new URL(url).hostname;
  if (host === PRODUCTION_DB_HOST_PREFIX || host.startsWith(PRODUCTION_DB_HOST_PREFIX)) {
    throw new Error(`Refusing to run: DATABASE_URL points at production (${host}).`);
  }
  if (!host.startsWith(REDESIGN_DB_HOST_PREFIX)) {
    throw new Error(`Refusing to run: DATABASE_URL host (${host}) is not the redesign branch.`);
  }
  console.log(`[equivalence] DATABASE_URL host verified as redesign branch: ${host}`);
}
assertNotProduction();

const prisma = new PrismaClient();

function scryptAsync(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}
async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = await scryptAsync(plain, salt);
  return `${salt}:${key.toString("hex")}`;
}

const SUFFIX = `${Date.now()}`;
// Same construction as tests/e2e/partner-fixtures.ts's `uniqueLocalPhone()` — a valid
// Egyptian mobile local number always starts with "10".
const LOCAL_PHONE = `10${SUFFIX.slice(-8)}`;
const PHONE = `+20${LOCAL_PHONE}`;
const PASSWORD = "EquivTest123!";

async function seed() {
  const passwordHash = await hashPassword(PASSWORD);
  const user = await prisma.user.create({ data: { phone: PHONE, role: "CUSTOMER", passwordHash } });
  const partner = await prisma.partner.create({
    data: { userId: user.id, partnerType: "AGENT", name: "وكيل تكافؤ 9.6", governorate: "القاهرة", phone: PHONE, isActive: true },
  });
  const category = await prisma.category.create({ data: { name: `فئة تكافؤ ${SUFFIX}`, slug: `equiv-cat-${SUFFIX}` } });
  const product = await prisma.product.create({
    data: { categoryId: category.id, name: `منتج تكافؤ ${SUFFIX}`, slug: `equiv-product-${SUFFIX}`, active: true, weightGrams: 300 },
  });
  const variant = await prisma.variant.create({
    data: { productId: product.id, sku: `EQ-${SUFFIX}`, name: "M", colorName: "أسود", pricePiastres: 10000 },
  });
  await prisma.partnerInventory.create({
    data: { partnerId: partner.id, variantId: variant.id, stockAvailable: 10, stockReserved: 0 },
  });
  const order = await prisma.order.create({
    data: {
      userId: user.id,
      status: "DELIVERED",
      assignedPartnerId: partner.id,
      subtotalPiastres: 10000,
      totalPiastres: 10000,
      shippingAddress: { governorate: "القاهرة", city: "القاهرة", area: "مدينة نصر" },
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      items: {
        create: [
          { variantId: variant.id, productName: product.name, variantName: `${product.slug}-${variant.sku}`, sku: variant.sku, quantity: 1, unitPricePiastres: 10000, totalPiastres: 10000 },
        ],
      },
    },
  });
  return { userId: user.id, partnerId: partner.id, categoryId: category.id, productId: product.id, variantId: variant.id, orderId: order.id };
}

async function cleanup(ids: Awaited<ReturnType<typeof seed>>) {
  await prisma.orderAuditLog.deleteMany({ where: { orderId: ids.orderId } });
  await prisma.order.delete({ where: { id: ids.orderId } });
  await prisma.partnerInventory.deleteMany({ where: { partnerId: ids.partnerId } });
  await prisma.variant.delete({ where: { id: ids.variantId } });
  await prisma.product.delete({ where: { id: ids.productId } });
  await prisma.category.delete({ where: { id: ids.categoryId } });
  await prisma.partner.delete({ where: { id: ids.partnerId } });
  await prisma.user.delete({ where: { id: ids.userId } });
}

async function loginAndGetCookie(base: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: PHONE, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed against ${base}: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie");
  if (!setCookie) throw new Error(`no set-cookie from ${base}`);
  return setCookie.split(";")[0];
}

const REPORTS = ["sales", "fulfilment", "inventory", "money", "network"] as const;

async function captureServer(base: string) {
  const cookie = await loginAndGetCookie(base);
  const jsonBodies: Record<string, unknown> = {};
  for (const kind of REPORTS) {
    const preset = kind === "inventory" ? "30d" : kind === "money" ? "month" : "30d";
    const res = await fetch(`${base}/api/partner/reports/${kind}?preset=${preset}`, { headers: { cookie } });
    jsonBodies[kind] = await res.json();
  }

  // Post-hydration `<main>` outerHTML via a real browser (same method the 9.4b/9.5 close-outs
  // used for their two-server proofs) — a raw `fetch()` of the HTML response instead would
  // capture the RSC flight payload's internal module/chunk ids, which shift whenever the
  // module graph's *size* changes anywhere in the app (e.g. this task's new admin routes)
  // even though the rendered content is identical; that is bundler bookkeeping noise, not a
  // content difference, so it is not what this proof is meant to catch.
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([
    { name: cookie.split("=")[0], value: cookie.split("=").slice(1).join("="), url: base },
  ]);
  const page = await context.newPage();
  const html: Record<string, string> = {};
  for (const slug of ["sales", "money"]) {
    await page.goto(`${base}/partner/reports/${slug}`, { waitUntil: "networkidle" });
    await page.waitForSelector("main");
    html[slug] = await page.locator("main").first().evaluate((el) => el.outerHTML);
  }
  await browser.close();

  return { jsonBodies, html };
}

function normalizeIds(str: string, ids: string[]): string {
  let out = str;
  ids.forEach((id, i) => {
    out = out.split(id).join(`__ID_${i}__`);
  });
  return out;
}

async function main() {
  const ids = await seed();
  try {
    console.log(`[equivalence] seeded partner ${ids.partnerId}, phone ${LOCAL_PHONE}`);
    const before = await captureServer("http://localhost:3172");
    const after = await captureServer("http://localhost:3166");

    fs.mkdirSync("screenshots", { recursive: true });
    fs.writeFileSync("screenshots/reports-9-6-equivalence-before.json", JSON.stringify(before.jsonBodies, null, 2));
    fs.writeFileSync("screenshots/reports-9-6-equivalence-after.json", JSON.stringify(after.jsonBodies, null, 2));
    fs.writeFileSync("screenshots/reports-9-6-equivalence-before-sales.html", before.html.sales);
    fs.writeFileSync("screenshots/reports-9-6-equivalence-after-sales.html", after.html.sales);
    fs.writeFileSync("screenshots/reports-9-6-equivalence-before-money.html", before.html.money);
    fs.writeFileSync("screenshots/reports-9-6-equivalence-after-money.html", after.html.money);

    const idsToNormalize = [ids.partnerId, ids.orderId, ids.variantId, ids.productId, ids.categoryId, ids.userId];

    let allIdentical = true;
    for (const kind of REPORTS) {
      const beforeStr = normalizeIds(JSON.stringify(before.jsonBodies[kind]), idsToNormalize);
      const afterStr = normalizeIds(JSON.stringify(after.jsonBodies[kind]), idsToNormalize);
      const identical = beforeStr === afterStr;
      console.log(`[equivalence] JSON ${kind}: ${identical ? "IDENTICAL" : "DIFFERS"}`);
      if (!identical) {
        allIdentical = false;
        // Print a short diff hint: first differing top-level key.
        const b = JSON.parse(beforeStr);
        const a = JSON.parse(afterStr);
        const bKeys = Object.keys(b.data ?? {});
        for (const k of bKeys) {
          if (JSON.stringify(b.data[k]) !== JSON.stringify(a.data?.[k])) {
            console.log(`  first differing key: data.${k}`);
            break;
          }
        }
      }
    }
    for (const page of ["sales", "money"] as const) {
      const beforeHtml = normalizeIds(before.html[page], idsToNormalize);
      const afterHtml = normalizeIds(after.html[page], idsToNormalize);
      const identical = beforeHtml === afterHtml;
      console.log(`[equivalence] SSR HTML ${page}: ${identical ? "IDENTICAL" : "DIFFERS"} (before ${beforeHtml.length}B, after ${afterHtml.length}B)`);
      if (!identical) allIdentical = false;
    }
    console.log(`\n[equivalence] RESULT: ${allIdentical ? "ALL IDENTICAL" : "SOME DIFFERENCES — see above"}`);
  } finally {
    await cleanup(ids);
    console.log("[equivalence] fixture cleaned up");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
