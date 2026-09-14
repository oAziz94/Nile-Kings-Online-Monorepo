/**
 * Backlog 9.8b bulk edit: pure price-rounding/plan logic, shared by the preview and apply
 * routes (`app/api/admin/products/bulk/{preview,apply}/route.ts`) so the number the admin
 * confirms in the preview table is guaranteed to be the number actually written — never
 * recomputed a second time and risking drift.
 */

export type BulkPriceRule = {
  field: "base" | "selling" | "both";
  mode: "amount" | "percent";
  /** Piastres for "amount" mode, a percentage (e.g. 10 for +10%) for "percent" mode. */
  value: number;
};

/** Rounds to the nearest piastre (always an integer already for "amount" mode; "percent" mode
 * is where fractional piastres can appear — e.g. 133 * 1.1 = 146.3 -> 146). */
export function roundToPiastre(value: number): number {
  return Math.round(value);
}

/** Applies one price rule to a single old price (piastres). Returns null if `old` is null (a
 * variant with no base price is left alone rather than inventing one). */
export function applyPriceRule(old: number | null, rule: BulkPriceRule): number | null {
  if (old == null) return null;
  const next = rule.mode === "percent" ? old * (1 + rule.value / 100) : old + rule.value;
  return Math.max(0, roundToPiastre(next));
}

export type BulkVariantInput = {
  id: string;
  sku: string;
  basePricePiastres: number | null;
  pricePiastres: number;
};

export type BulkVariantPlanEntry = {
  id: string;
  sku: string;
  oldBasePricePiastres: number | null;
  newBasePricePiastres: number | null;
  oldPricePiastres: number;
  newPricePiastres: number;
};

/** Builds the per-variant before/after for one product's variants under one price rule.
 * `field: "base"` only changes `basePricePiastres` (skipped when null); `"selling"` only
 * `pricePiastres`; `"both"` changes whichever of the two applies to each variant. */
export function planVariantPriceChanges(variants: BulkVariantInput[], rule: BulkPriceRule): BulkVariantPlanEntry[] {
  const touchesBase = rule.field === "base" || rule.field === "both";
  const touchesSelling = rule.field === "selling" || rule.field === "both";
  return variants.map((v) => {
    const newBase = touchesBase ? applyPriceRule(v.basePricePiastres, rule) : v.basePricePiastres;
    const newPrice = touchesSelling ? (applyPriceRule(v.pricePiastres, rule) ?? v.pricePiastres) : v.pricePiastres;
    return {
      id: v.id,
      sku: v.sku,
      oldBasePricePiastres: v.basePricePiastres,
      newBasePricePiastres: newBase,
      oldPricePiastres: v.pricePiastres,
      newPricePiastres: newPrice,
    };
  });
}
