/**
 * Egyptian national ID: 14 digits.
 * Positions 1–7: century (1), year (2–3), month (4–5), day (6–7).
 * Century: 2 = 19xx, 3 = 20xx.
 */

const ID_LENGTH = 14;
const SENIOR_AGE_YEARS = 60;

export type EgyptIdParseResult =
  | { ok: true; birthDate: Date; ageYears: number }
  | { ok: false; error: string };

/**
 * Parse Egyptian national ID and compute birthdate and age.
 * Validates 14 digits and reasonable date.
 */
export function parseEgyptianNationalId(id: string): EgyptIdParseResult {
  const digits = id.replace(/\D/g, "");
  if (digits.length !== ID_LENGTH) {
    return { ok: false, error: "رقم الهوية يجب أن يكون 14 رقماً" };
  }
  if (!/^\d+$/.test(digits)) {
    return { ok: false, error: "رقم الهوية يجب أن يحتوي على أرقام فقط" };
  }

  const century = parseInt(digits[0]!, 10);
  if (century !== 2 && century !== 3) {
    return { ok: false, error: "الرقم الأول غير صالح (يجب 2 أو 3)" };
  }

  const year2 = parseInt(digits.slice(1, 3), 10);
  const month = parseInt(digits.slice(3, 5), 10);
  const day = parseInt(digits.slice(5, 7), 10);

  const fullYear = century === 2 ? 1900 + year2 : 2000 + year2;
  if (month < 1 || month > 12) {
    return { ok: false, error: "شهر غير صالح" };
  }
  if (day < 1 || day > 31) {
    return { ok: false, error: "يوم غير صالح" };
  }

  const birthDate = new Date(fullYear, month - 1, day);
  if (
    birthDate.getFullYear() !== fullYear ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return { ok: false, error: "تاريخ ميلاد غير صالح" };
  }

  const today = new Date();
  let ageYears = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) ageYears -= 1;

  if (ageYears < SENIOR_AGE_YEARS) {
    return {
      ok: false,
      error: `يجب أن يكون عمرك ${SENIOR_AGE_YEARS} عاماً على الأقل للاستفادة من عرض أصحاب المعاشات`,
    };
  }

  return { ok: true, birthDate, ageYears };
}

/** Normalize ID to 14 digits for storage/fingerprint. */
export function normalizeNationalId(id: string): string {
  return id.replace(/\D/g, "").slice(0, ID_LENGTH).padStart(ID_LENGTH, "0");
}

/** Return last 4 digits for display only. */
export function maskNationalIdLast4(id: string): string {
  const digits = id.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return digits.slice(-4);
}
