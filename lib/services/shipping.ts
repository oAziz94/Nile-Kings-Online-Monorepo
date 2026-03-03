/**
 * Shipping service: select rule by provider + weight range + destination hierarchy.
 * Turbo: zone-based pricing from Turbo Price List (governorate + weight → fee with VAT).
 * Egypt Post: DB rules. Hierarchy: gov+city+area > gov+city > gov > global.
 * All amounts in piastres. Weight in grams.
 */

import { prisma } from "@/lib/db";

export const SHIPPING_PROVIDERS = ["Turbo", "Egypt Post"] as const;
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

// --- Turbo Price List (zone-based) ---
// First 2 KG base price (EGP) per zone; each additional KG = 10 EGP; +14% VAT
const TURBO_FIRST_2KG_EGP: Record<number, number> = {
  1: 75, 2: 95, 3: 94, 4: 99, 5: 104, 6: 122, 7: 132, 8: 188,
};
const TURBO_EXTRA_KG_EGP = 10;
const TURBO_VAT_RATE = 0.14;

/** Normalize for matching: trim, lowercase, remove extra spaces */
function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Governorate → Turbo zone (1–8). Zone is based only on governorate so saved and new addresses get the same rate. */
const TURBO_GOV_TO_ZONE: Record<string, number> = {
  // Zone 1: Cairo & Giza (core)
  "القاهرة": 1, "القاهره": 1, "cairo": 1,
  "الجيزة": 1, "الجيزه": 1, "giza": 1,
  // Zone 3: Alexandria & Qalyubia
  "الإسكندرية": 3, "الاسكندرية": 3, "الإسكندريه": 3, "alexandria": 3,
  "القليوبية": 3, "القليوبيه": 3, "qalyubia": 3,
  // Zone 4: Delta
  "كفر الشيخ": 4, "كفرالشيخ": 4,
  "دمياط": 4,
  "الغربية": 4, "الغربيه": 4,
  "البحيرة": 4, "البحيره": 4,
  "المنوفية": 4, "المنوفيه": 4,
  "الشرقية": 4, "الشرقيه": 4,
  "الدقهلية": 4, "الدقهليه": 4,
  // Zone 5: Canal
  "السويس": 5, "suez": 5,
  "الإسماعيلية": 5, "الاسماعيلية": 5, "الإسماعيليه": 5, "ismailia": 5,
  "بورسعيد": 5, "بور سعيد": 5, "port said": 5,
  // Zone 6: North Upper Egypt
  "بني سويف": 6, "بني سويق": 6, "beni suef": 6,
  "الفيوم": 6, "fayoum": 6, "faiyum": 6,
  "سوهاج": 6, "sohag": 6,
  "المنيا": 6, "minya": 6,
  "أسيوط": 6, "اسيوط": 6, "assiut": 6,
  // Zone 7: South Upper Egypt
  "قنا": 7, "qena": 7,
  "الأقصر": 7, "الاقصر": 7, "luxor": 7,
  "أسوان": 7, "اسوان": 7, "aswan": 7,
  // Zone 8: Border
  "مرسى مطروح": 8, "مرسي مطروح": 8, "مطروح": 8, "matrouh": 8,
  "البحر الأحمر": 8, "البحر الاحمر": 8, "red sea": 8,
  "شمال سيناء": 8, "شمال سينا": 8, "north sinai": 8,
  "جنوب سيناء": 8, "جنوب سينا": 8, "south sinai": 8,
  "الوادي الجديد": 8, "new valley": 8,
};

/** Governorate options for checkout dropdown (canonical Arabic labels, same as zone mapping). */
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

function getTurboZone(address: ShippingAddress): number | null {
  let gov = norm(address.governorate).replace(/^محافظة\s*/i, "").trim();

  let zoneFromGov = TURBO_GOV_TO_ZONE[gov];
  if (zoneFromGov === undefined) {
    const entry = Object.entries(TURBO_GOV_TO_ZONE).find(
      ([key]) => gov.includes(key) || key.includes(gov)
    );
    zoneFromGov = entry ? entry[1] : undefined;
  }
  return zoneFromGov ?? null;
}

/**
 * Calculate Turbo shipping fee from Turbo Price List: zone + weight → EGP, then +14% VAT, to piastres.
 * Uses only governorate so saved and new addresses with the same governorate get the same rate.
 */
export function calculateTurboFee(
  address: ShippingAddress,
  weightGrams: number
): ShippingOption | null {
  const zone = getTurboZone(address);
  if (zone == null) return null;

  const basePriceEGP = TURBO_FIRST_2KG_EGP[zone];
  if (basePriceEGP == null) return null;

  const weightKg = Math.max(0, weightGrams / 1000);
  const feeEGP =
    weightKg <= 2
      ? basePriceEGP
      : basePriceEGP + (weightKg - 2) * TURBO_EXTRA_KG_EGP;

  const withVAT = feeEGP * (1 + TURBO_VAT_RATE);
  const feePiastres = Math.round(withVAT * 100); // 1 EGP = 100 piastres

  return {
    ruleId: `turbo-zone-${zone}`,
    provider: "Turbo",
    feePiastres,
    governorate: address.governorate,
    city: address.city ?? null,
    area: address.area ?? null,
  };
}

/** Specificity level for tie-breaking: higher = more specific. */
function ruleSpecificityLevel(rule: {
  governorate: string;
  city: string | null;
  area: string | null;
}): number {
  const g = rule.governorate?.trim() || "";
  const c = rule.city?.trim() || "";
  const a = rule.area?.trim() || "";
  if (g && a && c) return 3; // gov+city+area
  if (g && c) return 2; // gov+city
  if (g) return 1; // gov only
  return 0; // global (empty governorate)
}

/**
 * Returns true if rule matches destination (gov/city/area or global).
 * Global rule: empty governorate matches any address.
 */
function ruleMatchesDestination(
  rule: { governorate: string; city: string | null; area: string | null },
  addr: ShippingAddress
): boolean {
  const rGov = rule.governorate?.trim().toLowerCase() || "";
  const rCity = rule.city?.trim().toLowerCase() ?? "";
  const rArea = rule.area?.trim().toLowerCase() ?? "";
  const aGov = addr.governorate?.trim().toLowerCase() || "";
  const aCity = addr.city?.trim().toLowerCase() ?? "";
  const aArea = addr.area?.trim().toLowerCase() ?? "";

  if (!rGov) return true; // global fallback

  if (rGov !== aGov) return false;
  if (rCity && rCity !== aCity) return false;
  if (rArea && rArea !== aArea) return false;
  return true;
}

/**
 * Get single shipping fee for a given provider + address + weight.
 * Turbo: zone-based calculation from Turbo Price List (governorate + weight, no DB).
 * Egypt Post: DB rules. Hierarchy: gov+city+area > gov+city > gov > global.
 */
export async function getShippingFeeForProvider(
  provider: string,
  address: ShippingAddress,
  weightGrams: number
): Promise<ShippingOption | null> {
  if (provider.trim().toLowerCase() === "turbo") {
    return calculateTurboFee(address, weightGrams);
  }

  const rules = await prisma.shippingRule.findMany({
    where: {
      active: true,
      provider: { equals: provider, mode: "insensitive" },
      weightMin: { lte: weightGrams },
      weightMax: { gte: weightGrams },
    },
  });

  const matching = rules.filter((r) => ruleMatchesDestination(r, address));
  if (matching.length === 0) return null;

  matching.sort((a, b) => {
    const priA = a.priority ?? 0;
    const priB = b.priority ?? 0;
    if (priA !== priB) return priA - priB;
    return ruleSpecificityLevel(b) - ruleSpecificityLevel(a);
  });

  const best = matching[0];
  return {
    ruleId: best.id,
    provider: best.provider,
    feePiastres: best.feePiastres,
    governorate: best.governorate,
    city: best.city,
    area: best.area,
  };
}

/**
 * Score rule by specificity: more specific match wins (area > city > governorate).
 * Then higher priority field breaks ties. Used by legacy getShippingFee.
 */
function ruleSpecificityScore(
  rule: { governorate: string; city: string | null; area: string | null },
  addr: ShippingAddress
): number {
  let score = 0;
  const govMatch =
    rule.governorate.trim().toLowerCase() === addr.governorate?.trim().toLowerCase();
  if (!govMatch) return -1;

  score += 1000;
  const cityMatch =
    rule.city != null &&
    addr.city != null &&
    rule.city.trim().toLowerCase() === addr.city.trim().toLowerCase();
  if (rule.city != null && rule.city.trim() !== "" && !cityMatch) return -1;
  if (cityMatch) score += 100;

  const areaMatch =
    rule.area != null &&
    addr.area != null &&
    rule.area.trim().toLowerCase() === addr.area.trim().toLowerCase();
  if (rule.area != null && rule.area.trim() !== "" && !areaMatch) return -1;
  if (areaMatch) score += 10;

  return score;
}

/**
 * Find applicable shipping rules for address and weight, then pick by specificity and priority.
 */
export async function getShippingFee(
  address: ShippingAddress,
  weightGrams: number
): Promise<ShippingOption | null> {
  const governorate = address.governorate?.trim();
  if (!governorate) return null;

  const rules = await prisma.shippingRule.findMany({
    where: {
      active: true,
      weightMin: { lte: weightGrams },
      weightMax: { gte: weightGrams },
      governorate: { equals: governorate, mode: "insensitive" },
      // Optional: further filter by city/area if rule has them (we'll filter in code for flexibility)
    },
    orderBy: { priority: "desc" },
  });

  const withScores: { rule: (typeof rules)[0]; score: number }[] = [];
  for (const rule of rules) {
    const score = ruleSpecificityScore(
      {
        governorate: rule.governorate,
        city: rule.city,
        area: rule.area,
      },
      address
    );
    if (score >= 0) withScores.push({ rule, score });
  }

  if (withScores.length === 0) return null;

  // Sort by specificity (desc) then by priority (desc)
  withScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.rule.priority ?? 0) - (a.rule.priority ?? 0);
  });

  const best = withScores[0].rule;
  return {
    ruleId: best.id,
    provider: best.provider,
    feePiastres: best.feePiastres,
    governorate: best.governorate,
    city: best.city,
    area: best.area,
  };
}

/**
 * Get all applicable shipping options for address and weight (e.g. for customer choice).
 */
export async function getShippingOptions(
  address: ShippingAddress,
  weightGrams: number
): Promise<ShippingOption[]> {
  const governorate = address.governorate?.trim();
  if (!governorate) return [];

  const rules = await prisma.shippingRule.findMany({
    where: {
      active: true,
      weightMin: { lte: weightGrams },
      weightMax: { gte: weightGrams },
      governorate: { equals: governorate, mode: "insensitive" },
    },
    orderBy: { priority: "desc" },
  });

  const withScores: { rule: (typeof rules)[0]; score: number }[] = [];
  for (const rule of rules) {
    const score = ruleSpecificityScore(
      {
        governorate: rule.governorate,
        city: rule.city,
        area: rule.area,
      },
      address
    );
    if (score >= 0)
      withScores.push({ rule, score });
  }

  withScores.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (b.rule.priority ?? 0) - (a.rule.priority ?? 0);
  });

  return withScores.map(({ rule }) => ({
    ruleId: rule.id,
    provider: rule.provider,
    feePiastres: rule.feePiastres,
    governorate: rule.governorate,
    city: rule.city,
    area: rule.area,
  }));
}
