/**
 * Greater Cairo area -> governorate lookup, for silently correcting a customer's
 * governorate pick when the "منطقة" they typed is confidently known to belong to a
 * different governorate (e.g. الدقي is Giza, not Cairo). Client-side static data only —
 * no DB/API calls, so this adds no server load.
 *
 * Scope: Cairo/Giza/Qalyubia only (the "Greater Cairo" cluster), where nearly all of this
 * ambiguity actually happens. An area not in this list is left uncorrected — we trust the
 * governorate the customer picked rather than guess.
 */

export type GreaterCairoGovernorate = "القاهرة" | "الجيزة" | "القليوبية";

type AreaEntry = { area: string; governorate: GreaterCairoGovernorate };

const GREATER_CAIRO_AREAS: AreaEntry[] = [
  // Giza — most commonly mistyped under Cairo
  { area: "الدقي", governorate: "الجيزة" },
  { area: "المهندسين", governorate: "الجيزة" },
  { area: "العجوزة", governorate: "الجيزة" },
  { area: "الشيخ زايد", governorate: "الجيزة" },
  { area: "٦ أكتوبر", governorate: "الجيزة" },
  { area: "6 أكتوبر", governorate: "الجيزة" },
  { area: "السادس من أكتوبر", governorate: "الجيزة" },
  { area: "الهرم", governorate: "الجيزة" },
  { area: "فيصل", governorate: "الجيزة" },
  { area: "إمبابة", governorate: "الجيزة" },
  { area: "بولاق الدكرور", governorate: "الجيزة" },
  { area: "حدائق الأهرام", governorate: "الجيزة" },
  { area: "الوراق", governorate: "الجيزة" },
  { area: "كرداسة", governorate: "الجيزة" },
  { area: "أوسيم", governorate: "الجيزة" },
  { area: "البدرشين", governorate: "الجيزة" },
  { area: "الصف", governorate: "الجيزة" },
  { area: "أطفيح", governorate: "الجيزة" },
  { area: "العياط", governorate: "الجيزة" },
  { area: "الحوامدية", governorate: "الجيزة" },

  // Qalyubia
  { area: "شبرا الخيمة", governorate: "القليوبية" },
  { area: "القناطر الخيرية", governorate: "القليوبية" },
  { area: "بنها", governorate: "القليوبية" },
  { area: "الخانكة", governorate: "القليوبية" },
  { area: "قليوب", governorate: "القليوبية" },
  { area: "طوخ", governorate: "القليوبية" },
  { area: "كفر شكر", governorate: "القليوبية" },
  { area: "شبين القناطر", governorate: "القليوبية" },

  // Cairo — included too, so a correct Cairo entry is confirmed rather than only ever
  // corrected away from.
  { area: "مدينة نصر", governorate: "القاهرة" },
  { area: "المعادي", governorate: "القاهرة" },
  { area: "مصر الجديدة", governorate: "القاهرة" },
  { area: "الشروق", governorate: "القاهرة" },
  { area: "التجمع الخامس", governorate: "القاهرة" },
  { area: "القاهرة الجديدة", governorate: "القاهرة" },
  { area: "حلوان", governorate: "القاهرة" },
  { area: "الزمالك", governorate: "القاهرة" },
  { area: "وسط البلد", governorate: "القاهرة" },
  { area: "شبرا", governorate: "القاهرة" },
  { area: "عين شمس", governorate: "القاهرة" },
  { area: "المقطم", governorate: "القاهرة" },
  { area: "الزيتون", governorate: "القاهرة" },
  { area: "الوايلي", governorate: "القاهرة" },
  { area: "السيدة زينب", governorate: "القاهرة" },
  { area: "الدرب الأحمر", governorate: "القاهرة" },
  { area: "باب الشعرية", governorate: "القاهرة" },
  { area: "روض الفرج", governorate: "القاهرة" },
  { area: "المرج", governorate: "القاهرة" },
  { area: "عزبة النخل", governorate: "القاهرة" },
  { area: "النزهة", governorate: "القاهرة" },
  { area: "بدر", governorate: "القاهرة" },
];

/** Normalize Arabic text for matching: unify hamza/alef/ya/ta-marbuta variants, collapse whitespace. */
function normalizeArabic(input: string): string {
  return input
    .trim()
    .replace(/[إأآا]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Longest area name first, so e.g. "شبرا الخيمة" matches before the shorter "شبرا". */
const ENTRIES_BY_LENGTH_DESC = [...GREATER_CAIRO_AREAS].sort(
  (a, b) => b.area.length - a.area.length
);

/**
 * Resolve the governorate for a typed "منطقة" against the Greater Cairo list.
 * Returns null when the area isn't confidently recognized — callers should leave the
 * customer's own governorate selection untouched in that case.
 */
export function resolveGovernorateForArea(area: string | null | undefined): string | null {
  const normalizedInput = normalizeArabic(area ?? "");
  if (!normalizedInput) return null;

  for (const entry of ENTRIES_BY_LENGTH_DESC) {
    const normalizedArea = normalizeArabic(entry.area);
    if (normalizedInput === normalizedArea || normalizedInput.includes(normalizedArea)) {
      return entry.governorate;
    }
  }
  return null;
}
