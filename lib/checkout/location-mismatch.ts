/**
 * Backlog 10.49 — checkout delivery address vs storefront location.
 *
 * Pure and client-safe (no Prisma / next/headers): used by the checkout page to decide whether to
 * show the "we will switch your agent" warning, and by `POST /api/checkout/place-order` as the
 * server-side guard that refuses to route an order to a partner of the wrong governorate.
 */

import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";

export const LOCATION_MISMATCH_CODE = "LOCATION_MISMATCH";

/** Same matching as `normalizeStorefrontGovernorate` (value or label), minus the server-only imports. */
export function canonicalGovernorate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = GOVERNORATE_OPTIONS.find((o) => o.value === trimmed || o.label === trimmed);
  return match?.value ?? null;
}

/**
 * True when the delivery address is in a different governorate than the storefront location.
 * An unrecognised address governorate counts as a mismatch (it can never match a partner's
 * governorate); a missing storefront governorate is reported separately by the caller.
 */
export function isLocationMismatch(
  addressGovernorate: string | null | undefined,
  storefrontGovernorate: string | null | undefined
): boolean {
  const storefront = canonicalGovernorate(storefrontGovernorate);
  if (!storefront) return false;
  return canonicalGovernorate(addressGovernorate) !== storefront;
}

export function locationMismatchWarning(addressGovernorate: string, storefrontGovernorate: string): string {
  return `عنوان التوصيل في ${addressGovernorate} بينما المتجر يعرض مخزون ${storefrontGovernorate} — سنحوّل طلبك لوكيل ${addressGovernorate}`;
}

/** Reads the (non-httpOnly) storefront location cookie in the browser. */
export function readStorefrontGovernorateFromBrowser(): string | null {
  if (typeof document === "undefined") return null;
  const entry = document.cookie.split("; ").find((c) => c.startsWith("nile_storefront_location="));
  if (!entry) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(entry.slice(entry.indexOf("=") + 1))) as { governorate?: unknown };
    return typeof parsed.governorate === "string" ? canonicalGovernorate(parsed.governorate) : null;
  } catch {
    return null;
  }
}
