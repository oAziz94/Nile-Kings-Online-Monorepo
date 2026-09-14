import { describe, it, expect } from "vitest";
import { roundToPiastre, applyPriceRule, planVariantPriceChanges } from "./bulk-edit";

describe("roundToPiastre", () => {
  it("rounds to the nearest integer", () => {
    expect(roundToPiastre(146.3)).toBe(146);
    expect(roundToPiastre(146.5)).toBe(147);
    expect(roundToPiastre(146.49)).toBe(146);
  });
});

describe("applyPriceRule", () => {
  it("+10% rounds to the piastre", () => {
    // 133 * 1.1 = 146.3 -> 146
    expect(applyPriceRule(133, { field: "selling", mode: "percent", value: 10 })).toBe(146);
  });

  it("-10% rounds to the piastre", () => {
    // 13300 * 0.9 = 11970 (exact)
    expect(applyPriceRule(13300, { field: "selling", mode: "percent", value: -10 })).toBe(11970);
  });

  it("amount mode adds piastres directly", () => {
    expect(applyPriceRule(10000, { field: "selling", mode: "amount", value: 500 })).toBe(10500);
  });

  it("never goes negative", () => {
    expect(applyPriceRule(100, { field: "selling", mode: "amount", value: -1000 })).toBe(0);
  });

  it("returns null for a null input (no base price to change)", () => {
    expect(applyPriceRule(null, { field: "base", mode: "percent", value: 10 })).toBeNull();
  });
});

describe("planVariantPriceChanges", () => {
  const variants = [
    { id: "v1", sku: "SKU-1", basePricePiastres: 15000, pricePiastres: 13300 },
    { id: "v2", sku: "SKU-2", basePricePiastres: null, pricePiastres: 9900 },
  ];

  it("field 'selling' only changes pricePiastres, base price untouched", () => {
    const plan = planVariantPriceChanges(variants, { field: "selling", mode: "percent", value: 10 });
    expect(plan[0]).toEqual({
      id: "v1",
      sku: "SKU-1",
      oldBasePricePiastres: 15000,
      newBasePricePiastres: 15000,
      oldPricePiastres: 13300,
      newPricePiastres: 14630,
    });
    // A variant with no base price stays null even though selling price changes.
    expect(plan[1].newBasePricePiastres).toBeNull();
    expect(plan[1].newPricePiastres).toBe(10890);
  });

  it("field 'base' only changes basePricePiastres, selling price untouched", () => {
    const plan = planVariantPriceChanges(variants, { field: "base", mode: "amount", value: 1000 });
    expect(plan[0].newBasePricePiastres).toBe(16000);
    expect(plan[0].newPricePiastres).toBe(13300);
    // null base price is left null, not invented.
    expect(plan[1].newBasePricePiastres).toBeNull();
  });

  it("field 'both' changes whichever applies to each variant", () => {
    const plan = planVariantPriceChanges(variants, { field: "both", mode: "percent", value: 10 });
    expect(plan[0].newBasePricePiastres).toBe(16500);
    expect(plan[0].newPricePiastres).toBe(14630);
    expect(plan[1].newBasePricePiastres).toBeNull();
    expect(plan[1].newPricePiastres).toBe(10890);
  });
});
