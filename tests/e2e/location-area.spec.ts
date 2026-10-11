import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { safeWhere } from "./db-cleanup";
import { setStorefrontLocationViaApi } from "./storefront-location";

// Backlog 10.48 — المنطقة dropdown with "أخرى…" in the location modal, the checkout address form
// and the profile saved-address form, plus the server-side governorate correction. Written in a
// worktree without env vars, so unrun there; the PM runs it in the main tree.

const prisma = new PrismaClient();
const FIXTURE_PHONE = "+201099955510";
const FIXTURE_PASSWORD = "LocationArea123!";

function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(plain, salt, 64, { N: 16384, r: 8, p: 1 }, (err, key) =>
      err ? reject(err) : resolve(`${salt}:${key.toString("hex")}`)
    );
  });
}

async function clearFixtureAddresses() {
  const user = await prisma.user.findUnique({ where: { phone: FIXTURE_PHONE } });
  if (user) await prisma.savedAddress.deleteMany({ where: safeWhere({ userId: user.id }) });
}

test.beforeAll(async () => {
  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  await prisma.user.upsert({
    where: { phone: FIXTURE_PHONE },
    create: { phone: FIXTURE_PHONE, role: "CUSTOMER", passwordHash },
    update: { passwordHash },
  });
  await clearFixtureAddresses();
});

test.afterAll(async () => {
  await clearFixtureAddresses();
  await prisma.$disconnect();
});

const modal = (page: Page) => page.getByRole("dialog", { name: "عنوان التوصيل" });

async function cookieAddress(page: Page) {
  const cookies = await page.context().cookies();
  const raw = cookies.find((c) => c.name === "nile_storefront_location")?.value;
  return raw ? (JSON.parse(decodeURIComponent(raw)) as { governorate: string; area: string | null }) : null;
}

async function openModal(page: Page) {
  await page.goto("/");
  const d = modal(page);
  await expect(d).toBeVisible({ timeout: 15_000 });
  return d;
}

test.describe("location modal", () => {
  test("area is disabled until a governorate is picked and lists بيلا under كفر الشيخ", async ({ page }) => {
    const d = await openModal(page);
    const area = d.getByTestId("area-select");
    await expect(area).toBeDisabled();
    await d.getByLabel("المحافظة *").selectOption("كفر الشيخ");
    await expect(area).toBeEnabled();
    await expect(area.locator("option", { hasText: "اختر المنطقة" })).toHaveCount(1);
    await expect(area.locator("option", { hasText: "بيلا" })).toHaveCount(1);
    await expect(area.locator("option").last()).toHaveText("أخرى…");
  });

  test("أخرى reveals a required free-text input; save stays disabled until it is filled", async ({ page }) => {
    const d = await openModal(page);
    await d.getByLabel("المحافظة *").selectOption("القاهرة");
    await expect(d.getByTestId("area-other-input")).toHaveCount(0);
    await d.getByTestId("area-select").selectOption({ label: "أخرى…" });
    const text = d.getByTestId("area-other-input");
    await expect(text).toBeVisible();
    await expect(d.getByRole("button", { name: "حفظ العنوان" })).toBeDisabled();
    await text.fill("حي غير معروف");
    await expect(d.getByRole("button", { name: "حفظ العنوان" })).toBeEnabled();
  });

  test("a listed area is saved as its label", async ({ page }) => {
    const d = await openModal(page);
    await d.getByLabel("المحافظة *").selectOption("كفر الشيخ");
    await d.getByTestId("area-select").selectOption({ label: "بيلا" });
    await Promise.all([page.waitForEvent("load"), d.getByRole("button", { name: "حفظ العنوان" }).click()]);
    expect(await cookieAddress(page)).toMatchObject({ governorate: "كفر الشيخ", area: "بيلا" });
  });

  test("أخرى + الدقي under القاهرة silently corrects to الجيزة and saves it", async ({ page }) => {
    const d = await openModal(page);
    await d.getByLabel("المحافظة *").selectOption("القاهرة");
    await d.getByTestId("area-select").selectOption({ label: "أخرى…" });
    await d.getByTestId("area-other-input").fill("الدقي");
    await d.getByTestId("area-other-input").blur();
    await expect(d.getByLabel("المحافظة *")).toHaveValue("الجيزة");
    await Promise.all([page.waitForEvent("load"), d.getByRole("button", { name: "حفظ العنوان" }).click()]);
    expect(await cookieAddress(page)).toMatchObject({ governorate: "الجيزة", area: "الدقي" });
  });

  test("city auto-filled from a governorate-as-city pick follows a later governorate change (verifier, 10.48)", async ({ page }) => {
    const d = await openModal(page);
    await d.getByLabel("المحافظة *").selectOption("القاهرة");
    await d.getByLabel("المحافظة *").selectOption("كفر الشيخ");
    await d.getByTestId("area-select").selectOption({ label: "بيلا" });
    await Promise.all([page.waitForEvent("load"), d.getByRole("button", { name: "حفظ العنوان" }).click()]);
    const saved = (await cookieAddress(page)) as { governorate: string; area: string | null; city?: string | null } | null;
    expect(saved).toMatchObject({ governorate: "كفر الشيخ", area: "بيلا" });
    expect(saved?.city ?? null).not.toBe("القاهرة");
  });

  test("changing governorate clears a dropdown pick from the previous list", async ({ page }) => {
    const d = await openModal(page);
    await d.getByLabel("المحافظة *").selectOption("القاهرة");
    await d.getByTestId("area-select").selectOption({ label: "مدينة نصر" });
    await d.getByLabel("المحافظة *").selectOption("الجيزة");
    await expect(d.getByTestId("area-select")).toHaveValue("");
  });
});

test.describe("server-side correction (never trust the client)", () => {
  test("POST /api/storefront/governorate corrects a known area of another governorate", async ({ page }) => {
    const res = await page.context().request.post("/api/storefront/governorate", {
      data: { governorate: "القاهرة", area: "الدقي" },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).data.governorate).toBe("الجيزة");
  });

  test("a homonym (المطرية) is NOT corrected", async ({ page }) => {
    const res = await page.context().request.post("/api/storefront/governorate", {
      data: { governorate: "الدقهلية", area: "المطرية" },
    });
    expect(res.ok()).toBeTruthy();
    expect((await res.json()).data.governorate).toBe("الدقهلية");
  });

  test("an unknown area leaves the governorate alone", async ({ page }) => {
    const res = await page.context().request.post("/api/storefront/governorate", {
      data: { governorate: "القاهرة", area: "حي غير معروف" },
    });
    expect((await res.json()).data.governorate).toBe("القاهرة");
  });
});

test.describe("signed-in forms", () => {
  test.describe.configure({ mode: "serial" });

  async function login(page: Page) {
    await setStorefrontLocationViaApi(page, "القاهرة", "مدينة نصر");
    const res = await page.request.post("/api/auth/login", {
      data: { phone: FIXTURE_PHONE, password: FIXTURE_PASSWORD },
    });
    expect(res.ok()).toBeTruthy();
  }

  test("profile form: dropdown lists areas, أخرى + الدقي under القاهرة saves as الجيزة", async ({ page }) => {
    await login(page);
    await page.goto("/profile/addresses");
    await page.getByRole("button", { name: "عنوان جديد" }).click();

    const area = page.getByTestId("area-select");
    await expect(area).toBeDisabled();
    const gov = page.getByLabel("المحافظة", { exact: true });
    await gov.selectOption({ label: "كفر الشيخ" });
    await expect(area.locator("option", { hasText: "بيلا" })).toHaveCount(1);

    await gov.selectOption({ label: "القاهرة" });
    await area.selectOption({ label: "أخرى…" });
    await page.getByTestId("area-other-input").fill("الدقي");
    await page.getByTestId("area-other-input").blur();
    await expect(gov).toHaveValue("الجيزة");

    await page.getByLabel("المدينة", { exact: true }).fill("الجيزة");
    await page.getByLabel("هاتف التوصيل", { exact: false }).fill("01099955510");
    await page.getByLabel("العنوان بالتفصيل", { exact: false }).fill("شارع الاختبار 2");
    await page.getByRole("button", { name: "حفظ العنوان" }).click();
    await expect(page.getByText("تمت إضافة العنوان").first()).toBeVisible();

    const user = await prisma.user.findUniqueOrThrow({ where: { phone: FIXTURE_PHONE } });
    const row = await prisma.savedAddress.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.governorate).toBe("الجيزة");
    expect(row.area).toBe("الدقي");
  });

  test("profile API corrects server-side even if the client sends the wrong governorate", async ({ page }) => {
    await login(page);
    const res = await page.request.post("/api/profile/addresses", {
      data: {
        governorate: "القاهرة",
        city: "الدقي",
        area: "الدقي",
        street: "شارع 1",
        phone: "01099955510",
      },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).data.governorate).toBe("الجيزة");
  });

  test("checkout form: dropdown, أخرى free text and the silent correction", async ({ page }) => {
    await login(page);
    await clearFixtureAddresses();

    // The checkout form needs a cart line; reuse any stocked variant.
    const list = (await (await page.request.get("/api/products?inStock=true&limit=20")).json()).data
      .products as { slug: string }[];
    let added = false;
    for (const { slug } of list) {
      const product = (await (await page.request.get(`/api/products/${slug}`)).json()).data;
      const variant = product.variants.find((v: { stockAvailable: number }) => v.stockAvailable >= 1);
      if (!variant) continue;
      const r = await page.request.post("/api/cart/items", { data: { variantId: variant.id, quantity: 1 } });
      if (r.ok()) {
        added = true;
        break;
      }
    }
    expect(added).toBeTruthy();

    await page.goto("/checkout");
    const gov = page.getByLabel("المحافظة *");
    const addNew = page.getByRole("button", { name: /إضافة عنوان (جديد|التوصيل)/ });
    await expect(gov.or(addNew)).toBeVisible({ timeout: 10_000 });
    if (await addNew.isVisible().catch(() => false)) await addNew.click();

    const area = page.getByLabel("المنطقة *");
    await expect(area).toBeDisabled();
    await gov.selectOption("كفر الشيخ");
    await expect(area.locator("option", { hasText: "بيلا" })).toHaveCount(1);

    await gov.selectOption("القاهرة");
    await area.selectOption({ label: "أخرى…" });
    await page.getByLabel("اسم المنطقة").fill("الدقي");
    await page.getByLabel("اسم المنطقة").blur();
    await expect(gov).toHaveValue("الجيزة");
  });
});
