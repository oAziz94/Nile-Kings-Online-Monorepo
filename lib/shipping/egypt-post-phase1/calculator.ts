/**
 * Egypt Post Wasalha Phase 1 shipping calculator.
 * Carrier fee: base + extra weight + insurance + VAT (shown to courier).
 * Shop surcharges: margin + prep (customer pays; hidden from courier).
 */

import {
  CAIRO_ORIGIN_PRICE_TABLE,
  VAT_RATE,
  INSURANCE_FEE_EGP,
  MARGIN_PERCENT,
  MARGIN_FLOOR_EGP,
  FIRST_KG_LIMIT,
  EXTRA_KG_EGP,
  PREP_SERVICE_FEE_EGP,
  type DestinationZone,
} from "./constants";
import { governorateToZone } from "./constants";

export type Phase1ShippingBreakdown = {
  zone: DestinationZone;
  baseShippingEGP: number;
  extraWeightChargeEGP: number;
  insuranceFeeEGP: number;
  /** 10% of (base + extra), min 5 EGP — not in carrier fee */
  marginAmountEGP: number;
  prepServiceFeeEGP: number;
  /** Carrier: (base + extra + insurance) before VAT */
  carrierSubtotalBeforeVatEGP: number;
  carrierVatAmountEGP: number;
  carrierShippingEGP: number;
  carrierFeePiastres: number;
  /** Customer shipping = carrier + margin + prep (no extra VAT on surcharges) */
  customerShippingEGP: number;
  feePiastres: number;
};

export type Phase1ShippingResult =
  | { ok: true; breakdown: Phase1ShippingBreakdown }
  | { ok: false; reason: "MISSING_WEIGHT" | "MISSING_GOVERNORATE" | "UNKNOWN_ZONE" | "MANUAL_REVIEW" };

/**
 * Calculate extra weight charge: 0 for first 2 kg, then ceil(weightKg - 2) * 7 EGP.
 */
export function calculateExtraWeightCharge(weightKg: number): number {
  if (weightKg <= FIRST_KG_LIMIT) return 0;
  const extraKg = Math.ceil(weightKg - FIRST_KG_LIMIT);
  return extraKg * EXTRA_KG_EGP;
}

/**
 * Calculate margin: max(10% of (base + extra weight), 5 EGP). Excluded from courier fee.
 */
export function calculateMargin(baseShippingEGP: number, extraWeightChargeEGP: number): number {
  const fromPercent = (baseShippingEGP + extraWeightChargeEGP) * MARGIN_PERCENT;
  return Math.max(fromPercent, MARGIN_FLOOR_EGP);
}

function buildBreakdown(
  zone: DestinationZone,
  baseShippingEGP: number,
  extraWeightChargeEGP: number
): Phase1ShippingBreakdown {
  const marginAmountEGP = calculateMargin(baseShippingEGP, extraWeightChargeEGP);
  const prepServiceFeeEGP = PREP_SERVICE_FEE_EGP;

  const carrierSubtotalBeforeVatEGP =
    baseShippingEGP + extraWeightChargeEGP + INSURANCE_FEE_EGP;
  const carrierVatAmountEGP = carrierSubtotalBeforeVatEGP * VAT_RATE;
  const carrierShippingEGP = carrierSubtotalBeforeVatEGP + carrierVatAmountEGP;
  const customerShippingEGP = carrierShippingEGP + marginAmountEGP + prepServiceFeeEGP;

  return {
    zone,
    baseShippingEGP,
    extraWeightChargeEGP,
    insuranceFeeEGP: INSURANCE_FEE_EGP,
    marginAmountEGP,
    prepServiceFeeEGP,
    carrierSubtotalBeforeVatEGP,
    carrierVatAmountEGP,
    carrierShippingEGP,
    carrierFeePiastres: Math.round(carrierShippingEGP * 100),
    customerShippingEGP,
    feePiastres: Math.round(customerShippingEGP * 100),
  };
}

/**
 * Full Phase 1 shipping calculation from governorate and weight (kg).
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
  return {
    ok: true,
    breakdown: buildBreakdown(zone, baseShippingEGP, extraWeightChargeEGP),
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
  return {
    ok: true,
    breakdown: buildBreakdown(destinationZone, baseShippingEGP, extraWeightChargeEGP),
  };
}
