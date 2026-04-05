/**
 * Unit tests for Egypt Post Phase 1 shipping: governorate mapping, weight, margin, final calculation.
 */

import { describe, it, expect } from "vitest";
import {
  governorateToZone,
  calculateExtraWeightCharge,
  calculateMargin,
  calculateShippingPhase1,
  calculateShippingPhase1ByZone,
  CAIRO_ORIGIN_PRICE_TABLE,
  INSURANCE_FEE_EGP,
  VAT_RATE,
  MARGIN_FLOOR_EGP,
} from "./index";

describe("governorateToZone", () => {
  it("maps Cairo, Giza, Qalyubia to CAIRO_METRO", () => {
    expect(governorateToZone("القاهرة")).toBe("CAIRO_METRO");
    expect(governorateToZone("الجيزة")).toBe("CAIRO_METRO");
    expect(governorateToZone("القليوبية")).toBe("CAIRO_METRO");
    expect(governorateToZone("cairo")).toBe("CAIRO_METRO");
    expect(governorateToZone("Giza")).toBe("CAIRO_METRO");
  });

  it("maps Alexandria, Beheira, etc. to ALEX_DELTA", () => {
    expect(governorateToZone("الإسكندرية")).toBe("ALEX_DELTA");
    expect(governorateToZone("البحيرة")).toBe("ALEX_DELTA");
    expect(governorateToZone("كفر الشيخ")).toBe("ALEX_DELTA");
    expect(governorateToZone("دمياط")).toBe("ALEX_DELTA");
  });

  it("maps Ismailia, Port Said, Suez to CANAL", () => {
    expect(governorateToZone("الإسماعيلية")).toBe("CANAL");
    expect(governorateToZone("بورسعيد")).toBe("CANAL");
    expect(governorateToZone("السويس")).toBe("CANAL");
  });

  it("maps Fayoum, Beni Suef, Minya, Assiut to NORTH_UPPER", () => {
    expect(governorateToZone("الفيوم")).toBe("NORTH_UPPER");
    expect(governorateToZone("بني سويف")).toBe("NORTH_UPPER");
    expect(governorateToZone("المنيا")).toBe("NORTH_UPPER");
    expect(governorateToZone("أسيوط")).toBe("NORTH_UPPER");
  });

  it("maps Sohag, Qena, Luxor, Aswan, Red Sea to SOUTH_UPPER_REDSEA", () => {
    expect(governorateToZone("سوهاج")).toBe("SOUTH_UPPER_REDSEA");
    expect(governorateToZone("قنا")).toBe("SOUTH_UPPER_REDSEA");
    expect(governorateToZone("الأقصر")).toBe("SOUTH_UPPER_REDSEA");
    expect(governorateToZone("أسوان")).toBe("SOUTH_UPPER_REDSEA");
    expect(governorateToZone("البحر الأحمر")).toBe("SOUTH_UPPER_REDSEA");
  });

  it("maps North/South Sinai, Marsa Matrouh, New Valley to REMOTE", () => {
    expect(governorateToZone("شمال سيناء")).toBe("REMOTE");
    expect(governorateToZone("جنوب سيناء")).toBe("REMOTE");
    expect(governorateToZone("مرسى مطروح")).toBe("REMOTE");
    expect(governorateToZone("الوادي الجديد")).toBe("REMOTE");
  });

  it("returns null for empty or unknown governorate", () => {
    expect(governorateToZone("")).toBeNull();
    expect(governorateToZone("   ")).toBeNull();
    expect(governorateToZone("Unknown Gov")).toBeNull();
  });
});

describe("calculateExtraWeightCharge", () => {
  it("returns 0 for weight <= 2 kg", () => {
    expect(calculateExtraWeightCharge(0)).toBe(0);
    expect(calculateExtraWeightCharge(1)).toBe(0);
    expect(calculateExtraWeightCharge(2)).toBe(0);
  });

  it("charges 7 EGP per additional kg (ceiling)", () => {
    expect(calculateExtraWeightCharge(2.1)).toBe(7);
    expect(calculateExtraWeightCharge(3)).toBe(7);
    expect(calculateExtraWeightCharge(3.1)).toBe(14);
    expect(calculateExtraWeightCharge(4)).toBe(14);
    expect(calculateExtraWeightCharge(5)).toBe(21);
  });
});

describe("calculateMargin", () => {
  it("uses 10% of (base + extra weight) when >= 5 EGP", () => {
    expect(calculateMargin(55, 0)).toBe(5.5); // 55 * 0.1 = 5.5
    expect(calculateMargin(60, 0)).toBe(6);
    expect(calculateMargin(55, 7)).toBeCloseTo(6.2, 10);
  });

  it("uses minimum 5 EGP when 10% is below 5", () => {
    expect(calculateMargin(30, 0)).toBe(5); // 30 * 0.1 = 3, floor 5
    expect(calculateMargin(40, 0)).toBe(5);
    expect(calculateMargin(49, 0)).toBe(5); // 4.9 < 5
  });
});

describe("calculateShippingPhase1ByZone", () => {
  it("returns error for missing or invalid weight", () => {
    expect(calculateShippingPhase1ByZone(0, "CAIRO_METRO").ok).toBe(false);
    expect(calculateShippingPhase1ByZone(-1, "CAIRO_METRO").ok).toBe(false);
    if (!calculateShippingPhase1ByZone(0, "CAIRO_METRO").ok) {
      expect((calculateShippingPhase1ByZone(0, "CAIRO_METRO") as { reason: string }).reason).toBe("MISSING_WEIGHT");
    }
  });

  it("calculates CAIRO_METRO to CAIRO_METRO for 2 kg: base 55 + insurance 0.5 + margin 5.5, then VAT 14%", () => {
    const result = calculateShippingPhase1ByZone(2, "CAIRO_METRO");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.breakdown.baseShippingEGP).toBe(CAIRO_ORIGIN_PRICE_TABLE.CAIRO_METRO);
      expect(result.breakdown.baseShippingEGP).toBe(55);
      expect(result.breakdown.extraWeightChargeEGP).toBe(0);
      expect(result.breakdown.insuranceFeeEGP).toBe(INSURANCE_FEE_EGP);
      expect(result.breakdown.marginAmountEGP).toBe(5.5);
      const subtotal = 55 + 0 + 0.5 + 5.5;
      expect(result.breakdown.subtotalBeforeVatEGP).toBe(subtotal);
      expect(result.breakdown.vatAmountEGP).toBeCloseTo(subtotal * VAT_RATE, 2);
      expect(result.breakdown.finalShippingEGP).toBeCloseTo(subtotal * (1 + VAT_RATE), 2);
      expect(result.breakdown.feePiastres).toBe(Math.round(result.breakdown.finalShippingEGP * 100));
    }
  });

  it("calculates REMOTE for 5 kg: base 110 + 21 extra + 0.5 insurance + margin, then VAT", () => {
    const result = calculateShippingPhase1ByZone(5, "REMOTE");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.breakdown.baseShippingEGP).toBe(110);
      expect(result.breakdown.extraWeightChargeEGP).toBe(21); // ceil(5-2)*7 = 21
      expect(result.breakdown.insuranceFeeEGP).toBe(0.5);
      expect(result.breakdown.marginAmountEGP).toBe(Math.max((110 + 21) * 0.1, MARGIN_FLOOR_EGP));
      expect(result.breakdown.marginAmountEGP).toBeCloseTo(13.1, 10);
      const subtotal =
        110 + 21 + 0.5 + result.breakdown.marginAmountEGP;
      expect(result.breakdown.subtotalBeforeVatEGP).toBeCloseTo(subtotal, 2);
      expect(result.breakdown.feePiastres).toBeGreaterThan(0);
    }
  });
});

describe("calculateShippingPhase1 (by governorate)", () => {
  it("returns error for missing governorate", () => {
    const r = calculateShippingPhase1(2, "");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("MISSING_GOVERNORATE");
  });

  it("returns error for unknown governorate", () => {
    const r = calculateShippingPhase1(2, "Unknown");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("UNKNOWN_ZONE");
  });

  it("returns same fee as ByZone for القاهرة 2 kg", () => {
    const byGov = calculateShippingPhase1(2, "القاهرة");
    const byZone = calculateShippingPhase1ByZone(2, "CAIRO_METRO");
    expect(byGov.ok).toBe(true);
    expect(byZone.ok).toBe(true);
    if (byGov.ok && byZone.ok) {
      expect(byGov.breakdown.feePiastres).toBe(byZone.breakdown.feePiastres);
      expect(byGov.breakdown.zone).toBe("CAIRO_METRO");
    }
  });
});
