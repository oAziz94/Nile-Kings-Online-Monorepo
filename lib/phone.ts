import parsePhoneNumber, { type CountryCode } from "libphonenumber-js/mobile";

export const EGYPT_MOBILE_ERROR_MESSAGE =
  "رقم الجوال يجب أن يكون رقم مصري صحيح يبدأ بـ 010 أو 011 أو 012 أو 015";

const EGYPT_MOBILE_NATIONAL_RE = /^(10|11|12|15)\d{8}$/;

/**
 * Delivery-address phone (per saved address; a courier-reachability requirement — Egypt
 * Post/Wasalha needs a number they can actually call during delivery in Egypt). Stays
 * Egypt-only per 04-decisions.md 2026-09-10 "International account phone numbers" — do NOT
 * generalize this one; use `normalizeAccountPhone` below for the account/login/register/
 * forgot-password identity phone instead.
 */
export function normalizeEgyptMobilePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const phone = parsePhoneNumber(trimmed, "EG");
  if (!phone || phone.country !== "EG" || !phone.isValid()) return null;
  if (!EGYPT_MOBILE_NATIONAL_RE.test(phone.nationalNumber)) return null;

  return phone.number;
}

export const ACCOUNT_PHONE_ERROR_MESSAGE = "رقم الجوال غير صحيح لهذه الدولة";

/**
 * Calling code (as offered by the account/login country-code dropdown, `lib/country-codes.ts`)
 * -> ISO 3166-1 alpha-2 "default country" hint for libphonenumber-js. Mirrors that dropdown's
 * 22 entries exactly. Per 04-decisions.md 2026-09-10 "International account phone numbers":
 * the account-identity phone (registration/login/password-reset) now validates against
 * whichever of these 22 countries the dropdown selects, instead of being hardcoded to Egypt.
 * The delivery-address phone above is a separate, intentionally-untouched concern.
 */
const ACCOUNT_PHONE_CALLING_CODE_TO_ISO: Record<string, CountryCode> = {
  "+20": "EG",
  "+966": "SA",
  "+971": "AE",
  "+962": "JO",
  "+965": "KW",
  "+973": "BH",
  "+974": "QA",
  "+968": "OM",
  "+964": "IQ",
  "+961": "LB",
  "+970": "PS",
  "+967": "YE",
  "+963": "SY",
  "+218": "LY",
  "+212": "MA",
  "+213": "DZ",
  "+216": "TN",
  "+249": "SD",
  "+90": "TR",
  "+1": "US",
  "+44": "GB",
  "+33": "FR",
  "+49": "DE",
};

// Longest-prefix-first: not actually ambiguous given today's 22 codes (none is a string
// prefix of another), but keeps prefix matching correct if the dropdown list ever grows.
const ACCOUNT_PHONE_CALLING_CODES_BY_LENGTH_DESC = Object.keys(
  ACCOUNT_PHONE_CALLING_CODE_TO_ISO
).sort((a, b) => b.length - a.length);

/**
 * Validate + normalize the account-identity phone (registration/login/password-reset) against
 * whichever of the 22 dropdown countries its "+<calling code>" prefix indicates, using
 * libphonenumber-js's mobile parser generically instead of hardcoding "EG" like
 * `normalizeEgyptMobilePhone` above. Returns E.164 (e.g. "+201012345678") or null if invalid.
 *
 * Checks the resolved `countryCallingCode` rather than requiring one exact ISO match, because
 * a handful of these calling codes are shared by more than one ISO territory (+1: US/Canada/
 * other NANP countries; +44: UK/Guernsey/Jersey/Isle of Man) — a real Canadian or Guernsey
 * number entered under the dropdown's single "+1"/"+44" entry should not be wrongly rejected
 * just because libphonenumber resolves its specific `.country` to "CA"/"GG" instead of the
 * dropdown's nominal "US"/"GB".
 */
export function normalizeAccountPhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const callingCode = ACCOUNT_PHONE_CALLING_CODES_BY_LENGTH_DESC.find((code) =>
    trimmed.startsWith(code)
  );
  if (!callingCode) return null;

  const iso = ACCOUNT_PHONE_CALLING_CODE_TO_ISO[callingCode];
  const phone = parsePhoneNumber(trimmed, iso);
  if (!phone || !phone.isValid()) return null;
  if (`+${phone.countryCallingCode}` !== callingCode) return null;

  const type = phone.getType();
  if (type !== "MOBILE" && type !== "FIXED_LINE_OR_MOBILE") return null;

  return phone.number;
}

/**
 * Account-identity phone (registration/login/password-reset), formatted for WaPilot's
 * `chat_id` (E.164 with the leading "+" stripped). International equivalent of the old,
 * deleted `normalizeEgyptMobilePhoneForWhatsApp` (Egypt-only, built on `normalizeEgyptMobilePhone`)
 * — this one is built on `normalizeAccountPhone` instead, so it validates against whichever of
 * the 22 dropdown countries the number belongs to, same as the rest of the account-phone flow.
 * See docs/redesign/04-decisions.md 2026-09-10 "WhatsApp OTP via WaPilot" — do not let WhatsApp
 * delivery regress to Egypt-only the way the old deleted registration-OTP path was.
 */
export function normalizeAccountPhoneForWhatsApp(input: string): string | null {
  const normalized = normalizeAccountPhone(input);
  return normalized ? normalized.replace(/^\+/, "") : null;
}
