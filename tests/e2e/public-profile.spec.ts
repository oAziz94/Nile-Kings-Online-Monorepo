import { test, expect } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";

// Backlog 4.13 (Profile: shell, account, addresses, orders, senior) regression coverage.
// Same seeded-fixture-user + scrypt-hash pattern as tests/e2e/auth-login.spec.ts, run against
// the redesign Neon branch only (test-env.ts's production guard). Logs in through the real UI
// (no direct cookie injection) so the session cookie is the one the app itself issues.

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

const FIXTURE_PHONE = "+201099911223";
const FIXTURE_PASSWORD = "ProfileTest123!";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  await prisma.user.upsert({
    where: { phone: FIXTURE_PHONE },
    create: { phone: FIXTURE_PHONE, role: "CUSTOMER", passwordHash, name: "عميل الاختبار" },
    update: { passwordHash, role: "CUSTOMER" },
  });
});

test.afterAll(async () => {
  // Leave no address rows behind for this fixture user.
  const user = await prisma.user.findUnique({ where: { phone: FIXTURE_PHONE } });
  if (user) {
    await prisma.savedAddress.deleteMany({ where: { userId: user.id } });
  }
  await prisma.$disconnect();
});

async function setGovernorate(page: import("@playwright/test").Page) {
  // Dismisses the storefront's location-picker modal, which otherwise overlays every page
  // (including /profile/*) for a session with no governorate set yet and intercepts clicks —
  // same pattern as tests/e2e/public-cart.spec.ts.
  const res = await page.request.post("/api/storefront/governorate", {
    data: { governorate: "القاهرة" },
  });
  expect(res.ok()).toBeTruthy();
}

async function loginViaUi(page: import("@playwright/test").Page) {
  await setGovernorate(page);
  await page.goto("/login");
  await page.getByLabel("رقم الهاتف").fill(FIXTURE_PHONE.replace("+20", ""));
  await page.getByLabel("كلمة المرور").fill(FIXTURE_PASSWORD);
  await page.getByRole("button", { name: "تسجيل الدخول" }).click();
  // A cold Neon/Upstash connection can occasionally push the login round-trip past the default
  // 5s expect timeout — give this specific navigation more room rather than flaking the suite.
  await expect(page).toHaveURL("/", { timeout: 15000 });
}

test("unauthenticated visit redirects to login", async ({ page }) => {
  // ProfileLayout's server-side guard redirects to "/login?redirect=/profile" regardless of
  // which sub-route was requested — unchanged parity from the pre-redesign layout.
  await page.goto("/profile/account");
  await expect(page).toHaveURL(/\/login\?redirect=(%2Fprofile|\/profile)$/);
});

test("nav shows all four sections including العرض الخاص, and account save works", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/profile/account");

  await expect(page.getByRole("heading", { name: "حسابي" }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "طلباتي" })).toBeVisible();
  await expect(page.getByRole("link", { name: "عناويني" })).toBeVisible();
  await expect(page.getByRole("link", { name: "العرض الخاص" })).toBeVisible();

  const phoneInput = page.getByLabel("رقم الجوال");
  await expect(phoneInput).toBeDisabled();
  await expect(page.getByText("رقم الهاتف هو معرّف حسابك ولا يمكن تغييره من هنا.")).toBeVisible();

  const emailInput = page.getByLabel("البريد الإلكتروني (اختياري)");
  await expect(emailInput).toHaveAttribute("type", "email");

  const nameInput = page.getByLabel("الاسم");
  await nameInput.fill("عميل معدّل");
  await page.getByRole("button", { name: "حفظ التعديلات" }).click();
  await expect(page.getByText("تم تحديث بيانات الحساب").first()).toBeVisible();
});

test("addresses: add, set default, delete via the styled dialog", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/profile/addresses");

  await expect(page.getByRole("heading", { name: "عناويني" })).toBeVisible();

  await page.getByRole("button", { name: "عنوان جديد" }).click();

  await page.getByLabel("المحافظة", { exact: false }).selectOption({ label: "القاهرة" });
  await page.getByLabel("المدينة", { exact: false }).fill("مدينة نصر");
  await page.getByLabel("هاتف التوصيل", { exact: false }).fill("01011122233");
  await page.getByLabel("المنطقة", { exact: false }).fill("الحي السابع");
  await page.getByLabel("العنوان بالتفصيل", { exact: false }).fill("شارع الاختبار 1");

  await page.getByRole("button", { name: "إضافة" }).click();
  await expect(page.getByText("تمت إضافة العنوان").first()).toBeVisible();

  const row = page.locator("li", { hasText: "مدينة نصر" }).first();
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "تعيين افتراضي" }).click();
  await expect(page.getByText("تم تعيين العنوان الافتراضي").first()).toBeVisible();
  await expect(row.getByText("افتراضي", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "حذف" }).click();
  const dialog = page.getByRole("dialog", { name: "حذف هذا العنوان؟" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "حذف" }).click();
  await expect(page.getByText("تم حذف العنوان").first()).toBeVisible();
  await expect(page.locator("li", { hasText: "مدينة نصر" })).toHaveCount(0);
});

test("orders: renders the empty state for a fixture user with no orders", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/profile/orders");

  await expect(page.getByRole("heading", { name: "طلباتي" })).toBeVisible();
  await expect(page.getByText("لا توجد طلبات حتى الآن.")).toBeVisible();
  const shopLink = page.getByRole("link", { name: "تسوق الآن" });
  await expect(shopLink).toBeVisible();
  await expect(shopLink).toHaveAttribute("href", "/categories");
});

test("senior page is reachable from the nav and shows the verification form", async ({ page }) => {
  await loginViaUi(page);
  await page.goto("/profile/account");
  await page.getByRole("link", { name: "العرض الخاص" }).click();
  await expect(page).toHaveURL(/\/profile\/senior$/);

  await expect(page.getByRole("heading", { name: "العرض الخاص" })).toBeVisible();
  await expect(page.getByLabel("رقم الهوية الوطنية (14 رقماً)")).toBeVisible();
  const submit = page.getByRole("button", { name: "إرسال للتحقق" });
  await expect(submit).toBeDisabled();
});
