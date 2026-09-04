import { cache } from "react";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";

export const STOREFRONT_GOVERNORATE_COOKIE = "nile_storefront_governorate";

export type StorefrontStockContext = {
  governorate: string | null;
  partnerId: string | null;
};

export function normalizeStorefrontGovernorate(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = GOVERNORATE_OPTIONS.find((option) => option.value === trimmed || option.label === trimmed);
  return match?.value ?? null;
}

export function getStorefrontGovernorateFromRequest(req: NextRequest): string | null {
  return normalizeStorefrontGovernorate(req.cookies.get(STOREFRONT_GOVERNORATE_COOKIE)?.value);
}

export async function getStorefrontGovernorateFromCookies(): Promise<string | null> {
  const cookieStore = await cookies();
  return normalizeStorefrontGovernorate(cookieStore.get(STOREFRONT_GOVERNORATE_COOKIE)?.value);
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
  if (!partnerId || variants.length === 0) return variants;

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
  if (!partnerId || variantIds.length === 0) return null;

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
  if (!context.partnerId) {
    const variant = await prisma.variant.findUnique({
      where: { id: variantId },
      select: { stockAvailable: true, stockReserved: true },
    });
    return variant ? Math.max(0, variant.stockAvailable - variant.stockReserved) : 0;
  }

  const row = await prisma.partnerInventory.findUnique({
    where: { partnerId_variantId: { partnerId: context.partnerId, variantId } },
    select: { stockAvailable: true, stockReserved: true },
  });
  return row ? Math.max(0, row.stockAvailable - row.stockReserved) : 0;
}
