/**
 * Phase 1 shipping constants: Egypt Post Wasalha, origin Cairo only.
 * All monetary values in EGP unless noted.
 */

/** Single carrier and service for Phase 1 */
export const PHASE1_CARRIER = "EGYPT_POST" as const;
export const PHASE1_SERVICE = "WASALHA" as const;

/** Origin is always Cairo (CAIRO_METRO) for Phase 1 */
export const ORIGIN_ZONE = "CAIRO_METRO" as const;

/** Destination zone identifiers */
export type DestinationZone =
  | "CAIRO_METRO"
  | "ALEX_DELTA"
  | "CANAL"
  | "NORTH_UPPER"
  | "SOUTH_UPPER_REDSEA"
  | "REMOTE";

export const DESTINATION_ZONES: DestinationZone[] = [
  "CAIRO_METRO",
  "ALEX_DELTA",
  "CANAL",
  "NORTH_UPPER",
  "SOUTH_UPPER_REDSEA",
  "REMOTE",
];

/** VAT fixed at 14% */
export const VAT_RATE = 0.14;

/** Insurance fee in EGP */
export const INSURANCE_FEE_EGP = 0.5;

/** Safe margin: 10% of (base + weight extra), minimum 5 EGP */
export const MARGIN_PERCENT = 0.1;
export const MARGIN_FLOOR_EGP = 5;

/** Weight: first 2 kg at base price, then +7 EGP per additional kg */
export const FIRST_KG_LIMIT = 2;
export const EXTRA_KG_EGP = 7;

/**
 * Base shipping price from CAIRO_METRO to each zone (EGP).
 * Origin is always Cairo for Phase 1.
 */
export const CAIRO_ORIGIN_PRICE_TABLE: Record<DestinationZone, number> = {
  CAIRO_METRO: 55,
  ALEX_DELTA: 65,
  CANAL: 70,
  NORTH_UPPER: 75,
  SOUTH_UPPER_REDSEA: 100,
  REMOTE: 110,
};

/**
 * Governorate → destination zone.
 * Keys: normalized governorate (Arabic and common variants).
 */
const GOVERNORATE_TO_ZONE_RAW: Record<string, DestinationZone> = {
  // CAIRO_METRO: Cairo, Giza, Qalyubia
  "القاهرة": "CAIRO_METRO",
  "القاهره": "CAIRO_METRO",
  cairo: "CAIRO_METRO",
  "الجيزة": "CAIRO_METRO",
  "الجيزه": "CAIRO_METRO",
  giza: "CAIRO_METRO",
  "القليوبية": "CAIRO_METRO",
  "القليوبيه": "CAIRO_METRO",
  qalyubia: "CAIRO_METRO",

  // ALEX_DELTA: Alexandria, Beheira, Monufia, Sharqia, Gharbia, Dakahlia, Damietta, Kafr El Sheikh
  "الإسكندرية": "ALEX_DELTA",
  "الاسكندرية": "ALEX_DELTA",
  "الإسكندريه": "ALEX_DELTA",
  alexandria: "ALEX_DELTA",
  "البحيرة": "ALEX_DELTA",
  "البحيره": "ALEX_DELTA",
  beheira: "ALEX_DELTA",
  "المنوفية": "ALEX_DELTA",
  "المنوفيه": "ALEX_DELTA",
  monufia: "ALEX_DELTA",
  "الشرقية": "ALEX_DELTA",
  "الشرقيه": "ALEX_DELTA",
  sharqia: "ALEX_DELTA",
  "الغربية": "ALEX_DELTA",
  "الغربيه": "ALEX_DELTA",
  gharbia: "ALEX_DELTA",
  "الدقهلية": "ALEX_DELTA",
  "الدقهليه": "ALEX_DELTA",
  dakahlia: "ALEX_DELTA",
  "دمياط": "ALEX_DELTA",
  damietta: "ALEX_DELTA",
  "كفر الشيخ": "ALEX_DELTA",
  "كفرالشيخ": "ALEX_DELTA",
  "kafr el sheikh": "ALEX_DELTA",

  // CANAL: Ismailia, Port Said, Suez
  "الإسماعيلية": "CANAL",
  "الاسماعيلية": "CANAL",
  "الإسماعيليه": "CANAL",
  ismailia: "CANAL",
  "بورسعيد": "CANAL",
  "بور سعيد": "CANAL",
  "port said": "CANAL",
  "السويس": "CANAL",
  suez: "CANAL",

  // NORTH_UPPER: Fayoum, Beni Suef, Minya, Assiut
  "الفيوم": "NORTH_UPPER",
  fayoum: "NORTH_UPPER",
  faiyum: "NORTH_UPPER",
  "بني سويف": "NORTH_UPPER",
  "بني سويق": "NORTH_UPPER",
  "beni suef": "NORTH_UPPER",
  "المنيا": "NORTH_UPPER",
  minya: "NORTH_UPPER",
  "أسيوط": "NORTH_UPPER",
  "اسيوط": "NORTH_UPPER",
  assiut: "NORTH_UPPER",

  // SOUTH_UPPER_REDSEA: Sohag, Qena, Luxor, Aswan, Red Sea
  "سوهاج": "SOUTH_UPPER_REDSEA",
  sohag: "SOUTH_UPPER_REDSEA",
  "قنا": "SOUTH_UPPER_REDSEA",
  qena: "SOUTH_UPPER_REDSEA",
  "الأقصر": "SOUTH_UPPER_REDSEA",
  "الاقصر": "SOUTH_UPPER_REDSEA",
  luxor: "SOUTH_UPPER_REDSEA",
  "أسوان": "SOUTH_UPPER_REDSEA",
  "اسوان": "SOUTH_UPPER_REDSEA",
  aswan: "SOUTH_UPPER_REDSEA",
  "البحر الأحمر": "SOUTH_UPPER_REDSEA",
  "البحر الاحمر": "SOUTH_UPPER_REDSEA",
  "red sea": "SOUTH_UPPER_REDSEA",

  // REMOTE: North Sinai, South Sinai, Marsa Matrouh, New Valley
  "شمال سيناء": "REMOTE",
  "شمال سينا": "REMOTE",
  "north sinai": "REMOTE",
  "جنوب سيناء": "REMOTE",
  "جنوب سينا": "REMOTE",
  "south sinai": "REMOTE",
  "مرسى مطروح": "REMOTE",
  "مرسي مطروح": "REMOTE",
  "مطروح": "REMOTE",
  "matrouh": "REMOTE",
  "مرسا مطروح": "REMOTE",
  "الوادي الجديد": "REMOTE",
  "new valley": "REMOTE",
};

function norm(s: string): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Map governorate name to destination zone.
 * Returns null if governorate cannot be resolved.
 */
export function governorateToZone(governorate: string): DestinationZone | null {
  const key = norm(governorate).replace(/^محافظة\s*/i, "").trim();
  if (!key) return null;
  const direct = GOVERNORATE_TO_ZONE_RAW[key];
  if (direct) return direct;
  const entry = Object.entries(GOVERNORATE_TO_ZONE_RAW).find(
    ([k]) => k && (key.includes(k) || k.includes(key))
  );
  return entry ? (entry[1] as DestinationZone) : null;
}
