/** Shared checkout types — split out of the old 986-line single-file page (backlog 4.12). */

export type CheckoutSummaryResponse = {
  subtotal: number;
  couponDiscount: number;
  seniorFreeValue: number;
  shippingFee: number;
  codFee: number;
  finalTotal: number;
  appliedCouponCode: string | null;
  shippingProvider: string;
  paymentMethod?: string;
  partnerName?: string | null;
};

export type SavedAddress = {
  id: string;
  label: string | null;
  governorate: string;
  city: string | null;
  area: string | null;
  street: string;
  building: string | null;
  floor: string | null;
  apartment: string | null;
  notes: string | null;
  phone: string;
  isDefault: boolean;
};

export type AddressFormValues = {
  label: string;
  governorate: string;
  city: string;
  area: string;
  street: string;
  floor: string;
  apartment: string;
  notes: string;
  phone: string;
};

export const emptyAddress: AddressFormValues = {
  label: "",
  governorate: "",
  city: "",
  area: "",
  street: "",
  floor: "",
  apartment: "",
  notes: "",
  phone: "",
};

export function addressToPayload(addr: AddressFormValues) {
  return {
    governorate: addr.governorate,
    city: addr.city.trim(),
    area: addr.area || null,
    street: addr.street,
    floor: addr.floor || null,
    apartment: addr.apartment || null,
    notes: addr.notes || null,
    phone: addr.phone,
  };
}

export function savedToAddress(s: SavedAddress): AddressFormValues {
  return {
    label: s.label ?? "",
    governorate: s.governorate,
    city: s.city ?? "",
    area: s.area ?? "",
    street: s.street,
    floor: s.floor ?? "",
    apartment: s.apartment ?? "",
    notes: s.notes ?? "",
    phone: s.phone,
  };
}

export function piastresToEgp(p: number) {
  return Math.round(p / 100);
}

/** EGP for display when amount may be small (e.g. COD fee); avoids showing 0 for 1 piastre. */
export function piastresToEgpDisplay(p: number) {
  if (p <= 0) return 0;
  const egp = p / 100;
  return egp < 1 && egp > 0 ? Number(egp.toFixed(2)) : Math.round(egp);
}
