import { expect, type Page } from "@playwright/test";

/**
 * Backlog 10.46: the storefront location modal is locked until a location is saved, so any spec
 * that browses a public page must set one first. Goes through the real
 * `POST /api/storefront/governorate` (the same path the modal uses) on the page's browser context,
 * so the `nile_storefront_location` cookie lands in that context's jar. Never weaken the lock
 * instead of calling this.
 */
export async function setStorefrontLocationViaApi(
  page: Page,
  governorate = "القاهرة",
  area: string | null = "مدينة نصر"
) {
  const res = await page.context().request.post("/api/storefront/governorate", {
    data: { governorate, area },
  });
  expect(res.ok(), `POST /api/storefront/governorate -> ${res.status()}`).toBeTruthy();
}
