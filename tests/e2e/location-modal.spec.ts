import { test, expect, type Page } from "@playwright/test";
import { setStorefrontLocationViaApi } from "./storefront-location";

// Backlog 10.46 — the storefront location modal hard-blocks every public page until a location
// is saved. Read-only apart from POST /api/storefront/governorate (cart row + cookie), no
// fixture phones involved.

const dialog = (page: Page) => page.getByRole("dialog", { name: "عنوان التوصيل" });

async function expectLocked(page: Page) {
  const d = dialog(page);
  // 15 s, not the 5 s default: on the dev server a cold route compile (/cart, /categories) can
  // delay the bootstrap response the dialog waits on (flaked 2/10 under two workers otherwise).
  await expect(d).toBeVisible({ timeout: 15_000 });
  // Radix sets role="dialog" and aria-hides the rest of the page; it does not emit a literal
  // aria-modal attribute, so assert what it really does (verifier, 10.46).
  await expect(d).toHaveAttribute("role", "dialog");
  await expect(d).toHaveAttribute("data-locked", "true");
  await expect(d.getByRole("button", { name: "إلغاء" })).toHaveCount(0);
  return d;
}

test.describe("fresh visitor (no location cookie)", () => {
  for (const path of ["/", "/categories", "/cart"]) {
    test(`${path}: dialog is shown and cannot be dismissed`, async ({ page }) => {
      await page.goto(path);
      const d = await expectLocked(page);

      // Backdrop click (top-left corner is outside the centred dialog).
      await page.mouse.click(2, 2);
      await expect(d).toBeVisible();
      // Escape.
      await page.keyboard.press("Escape");
      await expect(d).toBeVisible();

      // Body is not scrollable.
      const overflow = await page.evaluate(() => getComputedStyle(document.body).overflow);
      expect(overflow).toBe("hidden");
    });
  }

  test("a product page is locked too", async ({ page }) => {
    const res = await page.request.get("/api/products?limit=1");
    const json = await res.json();
    const slug = json?.data?.products?.[0]?.slug;
    expect(slug, "/api/products returned no product").toBeTruthy();
    await page.goto(`/products/${slug}`);
    await expectLocked(page);
  });

  test("Tab cycles inside the dialog", async ({ page }) => {
    await page.goto("/");
    const d = await expectLocked(page);
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]')
      );
      expect(inside, `focus escaped the dialog on Tab #${i + 1}`).toBeTruthy();
    }
    await page.keyboard.press("Shift+Tab");
    expect(await d.evaluate((el) => el.contains(document.activeElement))).toBeTruthy();
  });

  test("an opaque overlay covers the page while the bootstrap is still loading", async ({ page }) => {
    await page.route("**/api/storefront/bootstrap**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.getByTestId("location-loading-overlay")).toBeVisible();
    await expect(dialog(page)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("location-loading-overlay")).toHaveCount(0);
  });

  test("bootstrap and fallback GET both failing still shows the locked dialog with 27 governorates", async ({
    page,
  }) => {
    await page.route("**/api/storefront/bootstrap**", (route) =>
      route.fulfill({ status: 500, body: "{}" })
    );
    await page.route("**/api/storefront/governorate", (route) =>
      route.request().method() === "GET" ? route.fulfill({ status: 500, body: "{}" }) : route.continue()
    );
    await page.goto("/");
    const d = await expectLocked(page);
    await page.keyboard.press("Escape");
    await expect(d).toBeVisible();
    // 27 governorates + the placeholder option (the governorate select only — 10.48 added a
    // second select for the area).
    await expect(d.getByTestId("governorate-select").locator("option")).toHaveCount(28);
  });

  test("saving closes the lock: reload, then the pill shows the governorate", async ({ page }) => {
    await page.goto("/");
    const d = await expectLocked(page);
    await d.getByTestId("governorate-select").selectOption("القاهرة");
    await d.getByTestId("area-select").selectOption({ label: "مدينة نصر" });
    await Promise.all([
      page.waitForEvent("load"),
      d.getByRole("button", { name: "حفظ العنوان" }).click(),
    ]);
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /القاهرة/ })).toBeVisible();
  });

  test("clearing the cookie (expiry) locks the modal again", async ({ page }) => {
    await setStorefrontLocationViaApi(page);
    await page.goto("/");
    await expect(dialog(page)).toHaveCount(0);
    await page.context().clearCookies({ name: "nile_storefront_location" });
    await page.reload();
    await expectLocked(page);
  });
});

test.describe("visitor with a saved location", () => {
  test("no dialog on load; the pill opens an editable, closable modal", async ({ page }) => {
    await setStorefrontLocationViaApi(page);
    await page.goto("/");
    await expect(dialog(page)).toHaveCount(0);
    const pill = page.getByRole("button", { name: /القاهرة/ });
    await expect(pill).toBeVisible();

    // Escape closes.
    await pill.click();
    await expect(dialog(page)).toHaveAttribute("data-locked", "false");
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);

    // إلغاء closes.
    await pill.click();
    await dialog(page).getByRole("button", { name: "إلغاء" }).click();
    await expect(dialog(page)).toHaveCount(0);

    // Backdrop click closes.
    await pill.click();
    await expect(dialog(page)).toBeVisible();
    await page.mouse.click(2, 2);
    await expect(dialog(page)).toHaveCount(0);
  });
});
