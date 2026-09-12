import { describe, expect, it } from "vitest";
import {
  computeVariantSelection,
  validateVariantSelection,
  VARIANT_SELECTION_MESSAGES,
} from "./use-variant-selection";
import type { VariantPublic } from "@/lib/catalog";

function variant(overrides: Partial<VariantPublic>): VariantPublic {
  return {
    id: overrides.id ?? "v1",
    sku: overrides.sku ?? "SKU1",
    name: overrides.name ?? "M",
    priceEgp: overrides.priceEgp ?? 100,
    stockAvailable: overrides.stockAvailable ?? 5,
    inStock: overrides.inStock ?? true,
    colorHex: overrides.colorHex ?? "#000000",
    colorName: overrides.colorName ?? "أسود",
    slug: overrides.slug ?? "product_m_000000",
    imageUrl: overrides.imageUrl ?? null,
    ...overrides,
  };
}

describe("computeVariantSelection + validateVariantSelection", () => {
  it("branch 1: no size selected -> selectSize message", () => {
    const variants = [variant({ id: "a", name: "M" }), variant({ id: "b", name: "L" })];
    const state = computeVariantSelection(variants, false, null, null);
    const result = validateVariantSelection(null, state.selectedVariant, state.colorOptionsForSelectedSize, null);
    expect(result).toEqual({ ok: false, message: VARIANT_SELECTION_MESSAGES.selectSize });
  });

  it("branch 2: size selected, multiple colours, none chosen -> selectColor message", () => {
    const variants = [
      variant({ id: "a", name: "M", colorName: "أسود", colorHex: "#000000" }),
      variant({ id: "b", name: "M", colorName: "أبيض", colorHex: "#ffffff" }),
    ];
    const state = computeVariantSelection(variants, false, "M", null);
    expect(state.colorOptionsForSelectedSize.length).toBe(2);
    const result = validateVariantSelection("M", state.selectedVariant, state.colorOptionsForSelectedSize, null);
    expect(result).toEqual({ ok: false, message: VARIANT_SELECTION_MESSAGES.selectColor });
  });

  it("branch 3: still no resolved variant (data edge case) -> selectSize message again", () => {
    // Selected size has zero matching variants at all (data integrity edge case).
    const variants = [variant({ id: "a", name: "L" })];
    const state = computeVariantSelection(variants, false, "M", null);
    expect(state.selectedVariant).toBeNull();
    const result = validateVariantSelection("M", state.selectedVariant, state.colorOptionsForSelectedSize, null);
    expect(result).toEqual({ ok: false, message: VARIANT_SELECTION_MESSAGES.selectSize });
  });

  it("branch 4: resolved variant but out of stock -> outOfStock message", () => {
    const variants = [variant({ id: "a", name: "M", inStock: false, stockAvailable: 0 })];
    const state = computeVariantSelection(variants, false, "M", null);
    expect(state.selectedVariant?.id).toBe("a");
    const result = validateVariantSelection("M", state.selectedVariant, state.colorOptionsForSelectedSize, null);
    expect(result).toEqual({ ok: false, message: VARIANT_SELECTION_MESSAGES.outOfStock });
  });

  it("success: size + colour resolved and in stock -> ok with the variant", () => {
    const variants = [
      variant({ id: "a", name: "M", colorName: "أسود", colorHex: "#000000" }),
      variant({ id: "b", name: "M", colorName: "أبيض", colorHex: "#ffffff" }),
    ];
    const state = computeVariantSelection(variants, false, "M", "أسود|#000000");
    const result = validateVariantSelection("M", state.selectedVariant, state.colorOptionsForSelectedSize, "أسود|#000000");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.variant.id).toBe("a");
  });

  it("single colour for a size is auto-selected without requiring an explicit colour click", () => {
    const variants = [variant({ id: "a", name: "M", colorName: "أسود", colorHex: "#000000" })];
    const state = computeVariantSelection(variants, false, "M", null);
    expect(state.colorOptionsForSelectedSize.length).toBe(1);
    const result = validateVariantSelection("M", state.selectedVariant, state.colorOptionsForSelectedSize, null);
    expect(result).toEqual({ ok: true, variant: variants[0] });
  });

  it("kids relabeling only changes the displayed size label, not the id", () => {
    const variants = [variant({ id: "a", name: "S" })];
    const state = computeVariantSelection(variants, true, null, null);
    expect(state.sizeOptions[0].id).toBe("S");
    expect(state.sizeOptions[0].label).toBe("2");
  });
});
