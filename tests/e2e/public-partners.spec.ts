import { test, expect, type Page } from "@playwright/test";
import { loadRedesignTestEnv } from "./test-env";
loadRedesignTestEnv();

import { PrismaClient } from "@prisma/client";
import parsePhoneNumber from "libphonenumber-js/mobile";
import { safeWhere } from "./db-cleanup";

// Backlog 4.14 (Become a partner, `/partners`) regression coverage — same one-spec-per-screen
// pattern as tests/e2e/public-cart.spec.ts. Covers the `?type=` query contract, the client
// presence-only validation, the discard-confirmation dialog on a type switch with typed data, the
// inline phone-field error surfaced from a real server EGYPT_MOBILE_ERROR_MESSAGE rejection, and
// the in-page success panel (server `message`, no invented reference id, "إرسال طلب آخر" resets
// to a blank form). The success-path test creates one real `PartnerRequest` row on the redesign
// branch and deletes it in cleanup via Prisma, under test-env.ts's production guard.

const prisma = new PrismaClient();

/** A real, validly-formatted Egyptian mobile number in E.164 — mirrors lib/phone.ts's own
 * parsing, duplicated locally rather than importing "@/lib/phone" (no e2e spec imports via the
 * "@/" alias — see tests/e2e/auth-forgot-password.spec.ts's `saudiE164` for the same precedent). */
function egyptE164(national: string): string {
  const phone = parsePhoneNumber(`+20${national}`, "EG");
  if (!phone || !phone.isValid()) {
    throw new Error(`test fixture: "${national}" did not parse as a valid Egyptian mobile number`);
  }
  return phone.number;
}

let seq = 0;
/** Fresh 8-digit suffix per call, even across calls in the same millisecond. */
function uniqueSuffix(): string {
  seq += 1;
  return String(Date.now() + seq).slice(-8).padStart(8, "0");
}

async function setStorefrontLocation(page: Page, baseURL: string | undefined) {
  await page.context().addCookies([
    {
      name: "nile_storefront_location",
      value: encodeURIComponent(JSON.stringify({ governorate: "القاهرة", area: "مدينة نصر" })),
      url: baseURL ?? "http://localhost:3113",
    },
  ]);
}

test.describe("Become a partner (/partners)", () => {
  test("?type=distributor initializes the DISTRIBUTOR option and its own form title", async ({
    page,
    baseURL,
  }) => {
    await setStorefrontLocation(page, baseURL);
    await page.goto("/partners?type=distributor");

    await expect(page.getByRole("radio", { name: "موزع أونلاين" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await expect(page.getByRole("heading", { name: "طلب تسجيل موزع أونلاين" })).toBeVisible();
  });

  test("plain /partners (no query param) defaults to AGENT", async ({ page, baseURL }) => {
    await setStorefrontLocation(page, baseURL);
    await page.goto("/partners");

    await expect(page.getByRole("radio", { name: "وكيل أونلاين" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await expect(page.getByRole("heading", { name: "طلب تسجيل وكيل أونلاين" })).toBeVisible();
  });

  test("switching type with typed data asks first via a dialog; cancel keeps the data, confirm clears it", async ({
    page,
    baseURL,
  }) => {
    await setStorefrontLocation(page, baseURL);
    await page.goto("/partners");

    await page.getByLabel("الاسم").fill("محمد أحمد");

    // Cancel: data must survive, type must not switch.
    await page.getByRole("radio", { name: "موزع أونلاين" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("سيتم مسح البيانات المكتوبة");
    await dialog.getByRole("button", { name: "تراجع" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel("الاسم")).toHaveValue("محمد أحمد");
    await expect(page.getByRole("radio", { name: "وكيل أونلاين" })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    // Confirm: type switches and the form resets to blank.
    await page.getByRole("radio", { name: "موزع أونلاين" }).click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "متابعة" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("radio", { name: "موزع أونلاين" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    await expect(page.getByLabel("الاسم")).toHaveValue("");
  });

  test("an invalid Egyptian phone renders the server's message as the phone field's inline error", async ({
    page,
    baseURL,
  }) => {
    await setStorefrontLocation(page, baseURL);
    await page.goto("/partners");

    await page.getByLabel("الاسم").fill("اختبار الشريك");
    await page.getByLabel("المحافظة").selectOption("القاهرة");
    // A landline number: well-formed enough to pass client presence checks, rejected server-side.
    await page.getByLabel("رقم التليفون").fill("0223456789");
    await page.getByRole("button", { name: "إرسال الطلب" }).click();

    const phoneErrorText = "رقم الجوال يجب أن يكون رقم مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015";
    await expect(page.locator("#partner-phone-error")).toHaveText(phoneErrorText);
    const phoneField = page.getByLabel("رقم التليفون");
    await expect(phoneField).toHaveAttribute("aria-invalid", "true");
  });

  test("a real submission shows the in-page success panel, and 'إرسال طلب آخر' resets to a blank form", async ({
    page,
    baseURL,
  }) => {
    await setStorefrontLocation(page, baseURL);
    await page.goto("/partners");

    const phone = egyptE164(`10${uniqueSuffix()}`);
    // The field's own maxLength (30) and type="tel" accept the local, zero-prefixed form.
    const localPhone = "0" + phone.replace("+20", "");

    await page.getByLabel("الاسم").fill("اختبار الشريك الحقيقي");
    await page.getByLabel("المحافظة").selectOption("القاهرة");
    await page.getByLabel("رقم التليفون").fill(localPhone);
    await page.getByRole("button", { name: "إرسال الطلب" }).click();

    await expect(page.getByRole("heading", { name: "تم استلام طلبك" })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("تم استلام طلبك بنجاح")).toBeVisible();

    try {
      const created = await prisma.partnerRequest.findFirst({ where: { phone } });
      expect(created).not.toBeNull();
      expect(created?.requestType).toBe("AGENT");
    } finally {
      await prisma.partnerRequest.deleteMany({ where: safeWhere({ phone }) });
    }

    await page.getByRole("button", { name: "إرسال طلب آخر" }).click();
    await expect(page.getByRole("heading", { name: "طلب تسجيل وكيل أونلاين" })).toBeVisible();
    await expect(page.getByLabel("الاسم")).toHaveValue("");
  });
});

test.afterAll(async () => {
  await prisma.$disconnect();
});
