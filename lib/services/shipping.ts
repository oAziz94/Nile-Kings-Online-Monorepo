/**
 * Phase 1 shipping: Egypt Post Wasalha only.
 * Single carrier; origin Cairo; governorate → zone → calculator.
 * Old providers (Turbo, DB-based Egypt Post rules) and carrier selection are removed for Phase 1.
 */

import { calculateShippingPhase1 } from "@/lib/shipping/egypt-post-phase1";
import { PHASE1_CARRIER, PHASE1_SERVICE } from "@/lib/shipping/egypt-post-phase1";

/** Single carrier for Phase 1; no customer choice */
export const PHASE1_SHIPPING_PROVIDER_DISPLAY = "Egypt Post" as const;

/** Legacy export: single provider for types/order record */
export const SHIPPING_PROVIDERS = [PHASE1_SHIPPING_PROVIDER_DISPLAY] as const;
export type ShippingProvider = (typeof SHIPPING_PROVIDERS)[number];

export type ShippingAddress = {
  governorate: string;
  city?: string | null;
  area?: string | null;
};

export type ShippingOption = {
  ruleId: string;
  provider: string;
  feePiastres: number;
  governorate: string;
  city: string | null;
  area: string | null;
};

/** Governorate options for checkout dropdown (canonical Arabic labels). */
export const GOVERNORATE_OPTIONS: { value: string; label: string }[] = [
  { value: "القاهرة", label: "القاهرة" },
  { value: "الجيزة", label: "الجيزة" },
  { value: "الإسكندرية", label: "الإسكندرية" },
  { value: "القليوبية", label: "القليوبية" },
  { value: "كفر الشيخ", label: "كفر الشيخ" },
  { value: "دمياط", label: "دمياط" },
  { value: "الغربية", label: "الغربية" },
  { value: "البحيرة", label: "البحيرة" },
  { value: "المنوفية", label: "المنوفية" },
  { value: "الشرقية", label: "الشرقية" },
  { value: "الدقهلية", label: "الدقهلية" },
  { value: "السويس", label: "السويس" },
  { value: "الإسماعيلية", label: "الإسماعيلية" },
  { value: "بورسعيد", label: "بورسعيد" },
  { value: "بني سويف", label: "بني سويف" },
  { value: "الفيوم", label: "الفيوم" },
  { value: "سوهاج", label: "سوهاج" },
  { value: "المنيا", label: "المنيا" },
  { value: "أسيوط", label: "أسيوط" },
  { value: "قنا", label: "قنا" },
  { value: "الأقصر", label: "الأقصر" },
  { value: "أسوان", label: "أسوان" },
  { value: "مرسى مطروح", label: "مرسى مطروح" },
  { value: "البحر الأحمر", label: "البحر الأحمر" },
  { value: "شمال سيناء", label: "شمال سيناء" },
  { value: "جنوب سيناء", label: "جنوب سيناء" },
  { value: "الوادي الجديد", label: "الوادي الجديد" },
];

/**
 * Get Phase 1 shipping fee: Egypt Post Wasalha only.
 * Returns null if governorate is missing, zone cannot be resolved, or weight is invalid.
 * Caller must ensure all cart products have weightGrams set (otherwise do not call or pass weight only when known).
 */
export function getPhase1ShippingFee(
  address: ShippingAddress,
  weightGrams: number
): ShippingOption | null {
  const governorate = address.governorate?.trim();
  if (!governorate) return null;
  if (weightGrams <= 0 || !Number.isFinite(weightGrams)) return null;

  const weightKg = weightGrams / 1000;
  const result = calculateShippingPhase1(weightKg, governorate);

  if (!result.ok) return null;

  return {
    ruleId: `${PHASE1_CARRIER}-${PHASE1_SERVICE}`,
    provider: PHASE1_SHIPPING_PROVIDER_DISPLAY,
    feePiastres: result.breakdown.feePiastres,
    governorate: address.governorate,
    city: address.city ?? null,
    area: address.area ?? null,
  };
}
