/**
 * Egypt Post Wasalha Phase 1 shipping module.
 * Single carrier, origin Cairo; carrier fee (VAT on Wasalha) + shop surcharges (margin, prep).
 */

export {
  PHASE1_CARRIER,
  PHASE1_SERVICE,
  ORIGIN_ZONE,
  VAT_RATE,
  INSURANCE_FEE_EGP,
  MARGIN_PERCENT,
  MARGIN_FLOOR_EGP,
  FIRST_KG_LIMIT,
  EXTRA_KG_EGP,
  PREP_SERVICE_FEE_EGP,
  CAIRO_ORIGIN_PRICE_TABLE,
  DESTINATION_ZONES,
  governorateToZone,
} from "./constants";
export type { DestinationZone } from "./constants";

export {
  calculateShippingPhase1,
  calculateShippingPhase1ByZone,
  calculateExtraWeightCharge,
  calculateMargin,
} from "./calculator";
export type { Phase1ShippingBreakdown, Phase1ShippingResult } from "./calculator";
