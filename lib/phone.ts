import parsePhoneNumber from "libphonenumber-js/mobile";

export const EGYPT_MOBILE_ERROR_MESSAGE =
  "رقم الجوال يجب أن يكون رقم مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015";

const EGYPT_MOBILE_NATIONAL_RE = /^(10|11|12|15)\d{8}$/;

export function normalizeEgyptMobilePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const phone = parsePhoneNumber(trimmed, "EG");
  if (!phone || phone.country !== "EG" || !phone.isValid()) return null;
  if (!EGYPT_MOBILE_NATIONAL_RE.test(phone.nationalNumber)) return null;

  return phone.number;
}
