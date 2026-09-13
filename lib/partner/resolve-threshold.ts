/**
 * Per-category / per-product low-stock threshold resolution (backlog 5.1,
 * `05-partner-portal-v2.md` §4.1 + rule (13): "thresholds resolve through
 * `resolveThreshold()` — no screen compares against `Partner.lowStockThreshold`
 * directly"). Resolution order: product override -> category override -> the
 * partner's default (`Partner.lowStockThreshold`).
 *
 * `buildThresholdLookup` is the pure core (no Prisma) so it's directly unit-testable;
 * `resolveThreshold` is the thin async wrapper every screen/route calls.
 */
// Relative import (not the usual `@/lib/db` alias) so this module's pure
// `buildThresholdLookup` core stays importable from `tests/e2e/*.spec.ts` via Playwright's
// transform, which does not resolve the `@/*` tsconfig path alias for transitively-loaded
// application modules (only Next's own webpack build does).
import { prisma } from "../db";

export type ThresholdRow = {
  categoryId: string | null;
  productId: string | null;
  threshold: number;
};

export type ThresholdLookup = {
  defaultThreshold: number;
  /** Resolve the effective threshold for a variant's product/category. */
  forVariant: (input: { productId: string; categoryId: string }) => number;
};

export function buildThresholdLookup(defaultThreshold: number, rows: ThresholdRow[]): ThresholdLookup {
  const categoryThresholds = new Map<string, number>();
  const productThresholds = new Map<string, number>();
  for (const row of rows) {
    if (row.productId) {
      productThresholds.set(row.productId, row.threshold);
    } else if (row.categoryId) {
      categoryThresholds.set(row.categoryId, row.threshold);
    }
  }
  return {
    defaultThreshold,
    forVariant: ({ productId, categoryId }) =>
      productThresholds.get(productId) ?? categoryThresholds.get(categoryId) ?? defaultThreshold,
  };
}

/** Loads the partner's default threshold + every override and returns a resolver. */
export async function resolveThreshold(partnerId: string): Promise<ThresholdLookup> {
  const [partner, rows] = await Promise.all([
    prisma.partner.findUniqueOrThrow({
      where: { id: partnerId },
      select: { lowStockThreshold: true },
    }),
    prisma.partnerStockThreshold.findMany({
      where: { partnerId },
      select: { categoryId: true, productId: true, threshold: true },
    }),
  ]);
  return buildThresholdLookup(partner.lowStockThreshold, rows);
}
