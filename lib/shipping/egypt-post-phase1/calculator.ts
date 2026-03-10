/**
 * Egypt Post Wasalha Phase 1 shipping calculator.
 * Origin always Cairo; single carrier; no pickup fee; includes insurance and margin; VAT 14%.
 */

import {
  CAIRO_ORIGIN_PRICE_TABLE,
  VAT_RATE,
  INSURANCE_FEE_EGP,
  MARGIN_PERCENT,
  MARGIN_FLOOR_EGP,
  FIRST_KG_LIMIT,
  EXTRA_KG_EGP,
  type DestinationZone,
} from "./constants";
import { governorateToZone } from "./constants";

export type Phase1ShippingBreakdown = {
  zone: DestinationZone;
  baseShippingEGP: number;
  extraWeightChargeEGP: number;
  insuranceFeeEGP: number;
  marginAmountEGP: number;
  subtotalBeforeVatEGP: number;
  vatAmountEGP: number;
  finalShippingEGP: number;
  feePiastres: number;
};

export type Phase1ShippingResult =
  | { ok: true; breakdown: Phase1ShippingBreakdown }
  | { ok: false; reason: "MISSING_WEIGHT" | "MISSING_GOVERNORATE" | "UNKNOWN_ZONE" | "MANUAL_REVIEW" };

/**
 * Calculate extra weight charge: 0 for first 2 kg, then ceil(weightKg - 2) * 6 EGP.
 */
export function calculateExtraWeightCharge(weightKg: number): number {
  if (weightKg <= FIRST_KG_LIMIT) return 0;
  const extraKg = Math.ceil(weightKg - FIRST_KG_LIMIT);
  return extraKg * EXTRA_KG_EGP;
}

/**
 * Calculate margin: max(10% of (base + extra weight), 5 EGP).
 */
export function calculateMargin(baseShippingEGP: number, extraWeightChargeEGP: number): number {
  const fromPercent = (baseShippingEGP + extraWeightChargeEGP) * MARGIN_PERCENT;
  return Math.max(fromPercent, MARGIN_FLOOR_EGP);
}

/**
 * Full Phase 1 shipping calculation from governorate and weight (kg).
 * Returns result with breakdown or error reason.
 */
export function calculateShippingPhase1(
  weightKg: number,
  governorate: string
): Phase1ShippingResult {
  if (weightKg <= 0 || !Number.isFinite(weightKg)) {
    return { ok: false, reason: "MISSING_WEIGHT" };
  }
  const govTrim = governorate?.trim();
  if (!govTrim) {
    return { ok: false, reason: "MISSING_GOVERNORATE" };
  }
  const zone = governorateToZone(govTrim);
  if (!zone) {
    return { ok: false, reason: "UNKNOWN_ZONE" };
  }

  const baseShippingEGP = CAIRO_ORIGIN_PRICE_TABLE[zone];
  if (baseShippingEGP == null) {
    return { ok: false, reason: "MANUAL_REVIEW" };
  }

  const extraWeightChargeEGP = calculateExtraWeightCharge(weightKg);
  const marginAmountEGP = calculateMargin(baseShippingEGP, extraWeightChargeEGP);

  const subtotalBeforeVatEGP =
    baseShippingEGP + extraWeightChargeEGP + INSURANCE_FEE_EGP + marginAmountEGP;
  const vatAmountEGP = subtotalBeforeVatEGP * VAT_RATE;
  const finalShippingEGP = subtotalBeforeVatEGP + vatAmountEGP;
  const feePiastres = Math.round(finalShippingEGP * 100);

  return {
    ok: true,
    breakdown: {
      zone,
      baseShippingEGP,
      extraWeightChargeEGP,
      insuranceFeeEGP: INSURANCE_FEE_EGP,
      marginAmountEGP,
      subtotalBeforeVatEGP,
      vatAmountEGP,
      finalShippingEGP,
      feePiastres,
    },
  };
}

/**
 * Calculate Phase 1 shipping when zone is already known (e.g. for tests).
 */
export function calculateShippingPhase1ByZone(
  weightKg: number,
  destinationZone: DestinationZone
): Phase1ShippingResult {
  if (weightKg <= 0 || !Number.isFinite(weightKg)) {
    return { ok: false, reason: "MISSING_WEIGHT" };
  }
  const baseShippingEGP = CAIRO_ORIGIN_PRICE_TABLE[destinationZone];
  if (baseShippingEGP == null) {
    return { ok: false, reason: "MANUAL_REVIEW" };
  }
  const extraWeightChargeEGP = calculateExtraWeightCharge(weightKg);
  const marginAmountEGP = calculateMargin(baseShippingEGP, extraWeightChargeEGP);
  const subtotalBeforeVatEGP =
    baseShippingEGP + extraWeightChargeEGP + INSURANCE_FEE_EGP + marginAmountEGP;
  const vatAmountEGP = subtotalBeforeVatEGP * VAT_RATE;
  const finalShippingEGP = subtotalBeforeVatEGP + vatAmountEGP;
  const feePiastres = Math.round(finalShippingEGP * 100);
  return {
    ok: true,
    breakdown: {
      zone: destinationZone,
      baseShippingEGP,
      extraWeightChargeEGP,
      insuranceFeeEGP: INSURANCE_FEE_EGP,
      marginAmountEGP,
      subtotalBeforeVatEGP,
      vatAmountEGP,
      finalShippingEGP,
      feePiastres,
    },
  };
}
