import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

// Backlog 6.1 (Navbar additions + drawer + search page) regression coverage. Same seeded
// fixture-user + scrypt-hash pattern as tests/e2e/public-profile.spec.ts, run against the
// redesign Neon branch only (test-env.ts's production guard). A distinct phone from the other
// profile specs so this file's fixture never collides with theirs.

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

const FIXTURE_PHONE = "+201099911299";
const FIXTURE_PASSWORD = "NavbarTest123!";
const FIXTURE_NAME = "سارة أحمد";

let fixtureUserId: string;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  const user = await prisma.user.upsert({
    where: { phone: FIXTURE_PHONE },
    create: { phone: FIXTURE_PHONE, role: "CUSTOMER", passwordHash, name: FIXTURE_NAME },
    update: { passwordHash, role: "CUSTOMER", name: FIXTURE_NAME },
  });
  fixtureUserId = user.id;

  // One CREATED (open) order for the open-order-count assertions.
  const variant = await prisma.variant.findFirst({ select: { id: true, sku: true, name: true } });
  if (!variant) throw new Error("Fixture setup needs at least one Variant row to seed an order item");
  await prisma.order.create({
    data: {
      userId: fixtureUserId,
      status: "CREATED",
      subtotalPiastres: 65000,
      discountPiastres: 0,
      shippingPiastres: 0,
      codFeePiastres: 0,
      totalPiastres: 65000,
      shippingProvider: "Egypt Post",
      paymentMethod: "COD",
      shippingAddress: {
        governorate: "القاهرة",
        city: "مدينة نصر",
        area: "الحي السابع",
        street: "شارع الاختبار",
        phone: FIXTURE_PHONE,
      },
      items: {
        create: [
          {
            variantId: variant.id,
            productName: "تيشيرت قطن جيزة 100%",
            variantName: variant.name,
            sku: variant.sku,
            quantity: 1,
            unitPricePiastres: 65000,
            totalPiastres: 65000,
          },
        ],
      },
    },
  });
});

test.afterAll(async () => {
  await prisma.orderItem.deleteMany({ where: { order: { userId: fixtureUserId } } });
  await prisma.order.deleteMany({ where: { userId: fixtureUserId } });
  await prisma.savedAddress.deleteMany({ where: { userId: fixtureUserId } });
  await prisma.user.delete({ where: { id: fixtureUserId } }).catch(() => {});
  await prisma.$disconnect();
});

async function setStorefrontLocation(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([
    {
      name: "nile_storefront_location",
      value: encodeURIComponent(JSON.stringify({ governorate: "القاهرة", area: "مدينة نصر" })),
      url: baseURL ?? "http://localhost:3161",
    },
  ]);
}

async function loginViaUi(page: Page, baseURL: string | undefined) {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(FIXTURE_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(FIXTURE_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  await expect(page).toHaveURL("/", { timeout: 15000 });
}

test("home bar is transparent at load and opaque after scroll, and the search field is present", async ({
  page,
  baseURL,
}) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/");

  const header = page.getByRole("banner");
  await expect(header).toHaveClass(/bg-transparent/);

  const searchInput = header.getByRole("searchbox", { name: "ابحث عن منتج" });
  await expect(searchInput).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 400));
  await expect(header).toHaveClass(/bg-papyrus/);
});

test("search from the bar lands on /search with results for a known product and empty state for gibberish", async ({
  page,
  baseURL,
}) => {
  await setStorefrontLocation(page, baseURL);

  const productsRes = await page.request.get("/api/products?limit=1");
  const productsJson = await productsRes.json();
  const knownName: string = productsJson.data.products[0].name;
  const knownWord = knownName.split(/\s+/)[0];

  await page.goto("/");
  const searchInput = page.getByRole("banner").getByRole("searchbox", { name: "ابحث عن منتج" });
  await searchInput.fill(knownWord);
  await searchInput.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/search\\?q=${encodeURIComponent(knownWord)}`));
  await expect(page.getByRole("heading", { name: new RegExp(`نتائج البحث عن.*${knownWord}`) })).toBeVisible();
  await expect(page.locator("main, body").getByText(knownWord).first()).toBeVisible();

  await page.goto(`/search?q=${encodeURIComponent("zzxxqqgibberishnonsense")}`);
  await expect(page.getByText(/لا توجد نتائج لـ/)).toBeVisible();
  await expect(page.getByRole("link", { name: "تصفح التصنيفات" })).toHaveAttribute("href", "/categories");
});

test("empty q shows the empty prompt, not an error", async ({ page, baseURL }) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/search");
  await expect(page.getByText("اكتب اسم منتج في مربع البحث أعلى الصفحة.")).toBeVisible();
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
});

test("logged-in account menu shows the name and the open-order count", async ({ page, baseURL }) => {
  await loginViaUi(page, baseURL);
  await page.goto("/");

  const accountButton = page.getByRole("button", { name: "حسابي" });
  await expect(accountButton).toContainText("سارة");
  await accountButton.click();

  const menu = page.getByRole("menu");
  await expect(menu.getByText(FIXTURE_NAME)).toBeVisible();
  const ordersItem = menu.getByRole("menuitem", { name: /طلباتي/ });
  await expect(ordersItem).toContainText("1");
});

test("drawer shows the user card when logged in", async ({ page, baseURL }) => {
  await loginViaUi(page, baseURL);
  await page.goto("/");
  await page.getByRole("button", { name: "القائمة" }).click();
  const dialog = page.getByRole("dialog", { name: "القائمة" });
  await expect(dialog.getByText(`أهلًا، سارة`)).toBeVisible();
  await expect(dialog.getByRole("link", { name: "تسجيل الدخول" })).toHaveCount(0);
});

test("drawer shows the login/register buttons when logged out, and every link resolves", async ({
  page,
  baseURL,
}) => {
  await setStorefrontLocation(page, baseURL);
  await page.goto("/");
  await page.getByRole("button", { name: "القائمة" }).click();
  const dialog = page.getByRole("dialog", { name: "القائمة" });
  await expect(dialog.getByRole("link", { name: "تسجيل الدخول" })).toBeVisible();
  await expect(dialog.getByRole("link", { name: "حساب جديد" })).toBeVisible();

  const links = await dialog.locator("a[href]").evaluateAll((els) =>
    els.map((el) => el.getAttribute("href")).filter((href): href is string => Boolean(href) && !href.startsWith("http") && !href.startsWith("tel:"))
  );
  expect(links.length).toBeGreaterThan(0);
  for (const href of links) {
    const res = await page.request.get(href);
    expect(res.status(), `${href} should resolve`).toBeLessThan(400);
  }
});
