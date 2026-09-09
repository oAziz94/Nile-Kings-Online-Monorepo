import { cache } from "react";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";

/**
 * Holds the customer's full delivery location, not just the governorate — the location
 * modal collects area (and optionally city/street/phone/...) so the same value can both
 * route partner inventory and prefill checkout / seed a saved address. Replaces the older
 * governorate-only cookie; readers below still expose governorate-only accessors so the
 * many call sites that only ever needed that keep working unchanged.
 */
export const STOREFRONT_LOCATION_COOKIE = "nile_storefront_location";

export type StorefrontStockContext = {
  governorate: string | null;
  partnerId: string | null;
};

export type StorefrontAddress = {
  governorate: string;
  area: string | null;
  city: string | null;
  street: string | null;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  phone: string | null;
  label: string | null;
};

export function normalizeStorefrontGovernorate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = GOVERNORATE_OPTIONS.find((option) => option.value === trimmed || option.label === trimmed);
  return match?.value ?? null;
}

function readStringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parseStorefrontAddressCookie(raw: string | undefined): StorefrontAddress | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const governorate = normalizeStorefrontGovernorate(readStringField(record.governorate));
  if (!governorate) return null;

  return {
    governorate,
    area: readStringField(record.area),
    city: readStringField(record.city),
    street: readStringField(record.street),
    building: readStringField(record.building),
    floor: readStringField(record.floor),
    apartment: readStringField(record.apartment),
    phone: readStringField(record.phone),
    label: readStringField(record.label),
  };
}

export function getStorefrontGovernorateFromRequest(req: NextRequest): string | null {
  return parseStorefrontAddressCookie(req.cookies.get(STOREFRONT_LOCATION_COOKIE)?.value)?.governorate ?? null;
}

export async function getStorefrontGovernorateFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return parseStorefrontAddressCookie(cookieStore.get(STOREFRONT_LOCATION_COOKIE)?.value)?.governorate ?? null;
}

/** Full delivery location (governorate + whatever else the customer entered), or null if unset/invalid. */
export async function getStorefrontAddressFromCookies(): Promise<StorefrontAddress | null> {
  const cookieStore = await cookies();
  return parseStorefrontAddressCookie(cookieStore.get(STOREFRONT_LOCATION_COOKIE)?.value);
}

export async function getStorefrontStockContext(
  governorate: string | null
): Promise<StorefrontStockContext> {
  const normalized = normalizeStorefrontGovernorate(governorate);
  if (!normalized) return { governorate: null, partnerId: null };

  const rule = await prisma.reroutingRule.findFirst({
    where: { governorate: normalized, isActive: true },
    include: {
      partners: {
        where: { isActive: true, partner: { isActive: true } },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        include: { partner: { select: { id: true } } },
      },
    },
  });

  return {
    governorate: normalized,
    partnerId: rule?.partners[0]?.partner.id ?? null,
  };
}

/**
 * Cached per-request: multiple components/route handlers (e.g. generateMetadata + the page,
 * or several sections on one page) can call this without each re-querying the rerouting rule.
 */
export const getCurrentStorefrontStockContext = cache(
  async (): Promise<StorefrontStockContext> => {
    return getStorefrontStockContext(await getStorefrontGovernorateFromCookies());
  }
);

export async function applyStorefrontPartnerStock<T extends { id: string; stockAvailable: number }>(
  variants: T[],
  partnerId: string | null
): Promise<T[]> {
  if (variants.length === 0) return variants;
  // No partner covers the customer's chosen governorate: nothing is orderable from here.
  // Never fall back to the variant's own (legacy, no-longer-maintained) stockAvailable — that
  // field isn't kept in sync with real per-partner inventory and would show stale numbers.
  if (!partnerId) return variants.map((variant) => ({ ...variant, stockAvailable: 0 }));

  const rows = await prisma.partnerInventory.findMany({
    where: {
      partnerId,
      variantId: { in: variants.map((variant) => variant.id) },
    },
    select: { variantId: true, stockAvailable: true, stockReserved: true },
  });
  const byVariant = new Map(
    rows.map((row) => [
      row.variantId,
      Math.max(0, row.stockAvailable - row.stockReserved),
    ])
  );

  return variants.map((variant) => ({
    ...variant,
    stockAvailable: byVariant.get(variant.id) ?? 0,
  }));
}

/**
 * Batched partner-stock lookup: one query for however many variant ids are
 * passed in, instead of one query per product. Returns null when there's no
 * partner override to apply (caller should keep each variant's own stock).
 */
export async function getPartnerStockOverrides(
  variantIds: string[],
  partnerId: string | null
): Promise<Map<string, number> | null> {
  if (variantIds.length === 0) return null;
  // No partner covers the customer's chosen governorate: nothing is orderable from here.
  // Never fall back to variants' own (legacy, no-longer-maintained) stockAvailable.
  if (!partnerId) return new Map(variantIds.map((id) => [id, 0]));

  const rows = await prisma.partnerInventory.findMany({
    where: { partnerId, variantId: { in: variantIds } },
    select: { variantId: true, stockAvailable: true, stockReserved: true },
  });

  return new Map(rows.map((row) => [row.variantId, Math.max(0, row.stockAvailable - row.stockReserved)]));
}

/** Apply a lookup map from getPartnerStockOverrides. A null map means: use each variant's own stock as-is. */
export function applyPartnerStockOverrides<T extends { id: string; stockAvailable: number }>(
  variants: T[],
  overrides: Map<string, number> | null
): T[] {
  if (!overrides) return variants;
  return variants.map((variant) => ({
    ...variant,
    stockAvailable: overrides.get(variant.id) ?? 0,
  }));
}

export async function getStorefrontSellableQuantityForVariant(variantId: string): Promise<number> {
  const context = await getCurrentStorefrontStockContext();
  // No partner covers the customer's chosen governorate: nothing is orderable from here.
  // Never fall back to the variant's own (legacy, no-longer-maintained) stockAvailable.
  if (!context.partnerId) return 0;

  const row = await prisma.partnerInventory.findUnique({
    where: { partnerId_variantId: { partnerId: context.partnerId, variantId } },
    select: { stockAvailable: true, stockReserved: true },
  });
  return row ? Math.max(0, row.stockAvailable - row.stockReserved) : 0;
}
