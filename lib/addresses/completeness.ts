/** Fields required to place a checkout order (matches API validation). */
export type CheckoutAddressFields = {
  governorate?: string | null;
  city?: string | null;
  area?: string | null;
  street?: string | null;
  phone?: string | null;
};

export function hasSavedAddressCity(addr: Pick<CheckoutAddressFields, "city">): boolean {
  return !!addr.city?.trim();
}

/** Saved row missing city — common on addresses created before city was required. */
export function isSavedAddressIncomplete(addr: CheckoutAddressFields): boolean {
  return !hasSavedAddressCity(addr);
}

export function isCheckoutAddressComplete(addr: CheckoutAddressFields): boolean {
  return !!(
    addr.governorate?.trim() &&
    addr.city?.trim() &&
    addr.area?.trim() &&
    addr.street?.trim() &&
    addr.phone?.trim()
  );
}

/** Governorates where the city name matches the governorate (Egypt). */
export const GOVERNORATE_AS_CITY_VALUES = [
  "القاهرة",
  "الجيزة",
  "الإسكندرية",
  "بورسعيد",
  "السويس",
] as const;
