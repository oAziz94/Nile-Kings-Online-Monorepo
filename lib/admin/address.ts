import type { CheckoutAddress } from "@/lib/checkout/types";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";

export type SavedAddressRow = {
  id: string;
  userId: string;
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

export function savedAddressToCheckout(addr: SavedAddressRow): CheckoutAddress {
  return {
    governorate: addr.governorate,
    city: addr.city?.trim() || "",
    area: addr.area,
    street: addr.street,
    building: addr.building,
    floor: addr.floor,
    apartment: addr.apartment,
    notes: addr.notes,
    phone: addr.phone,
  };
}

export type CreateAddressInput = {
  label?: string | null;
  governorate: string;
  city: string;
  area: string;
  street: string;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
  notes?: string | null;
  phone: string;
  isDefault?: boolean;
};

export function parseCreateAddressInput(
  raw: unknown
): { ok: true; address: CreateAddressInput } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, message: "عنوان التوصيل مطلوب" };
  }
  const body = raw as Record<string, unknown>;
  const governorate = typeof body.governorate === "string" ? body.governorate.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const area = typeof body.area === "string" ? body.area.trim() : "";
  const street = typeof body.street === "string" ? body.street.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!governorate) return { ok: false, message: "المحافظة مطلوبة" };
  if (!city) return { ok: false, message: "المدينة مطلوبة" };
  if (!area) return { ok: false, message: "المنطقة مطلوبة" };
  if (!street) return { ok: false, message: "العنوان بالتفصيل مطلوب" };
  if (!phone) return { ok: false, message: "رقم هاتف التوصيل مطلوب" };
  const normalizedPhone = normalizeEgyptMobilePhone(phone);
  if (!normalizedPhone) return { ok: false, message: EGYPT_MOBILE_ERROR_MESSAGE };

  return {
    ok: true,
    address: {
      label: typeof body.label === "string" ? body.label.trim() || null : null,
      governorate,
      city,
      area,
      street,
      building: body.building != null ? String(body.building).trim() || null : null,
      floor: body.floor != null ? String(body.floor).trim() || null : null,
      apartment: body.apartment != null ? String(body.apartment).trim() || null : null,
      notes: body.notes != null ? String(body.notes).trim() || null : null,
      phone: normalizedPhone,
      isDefault: body.isDefault === true,
    },
  };
}

export function parseCheckoutAddressInput(
  raw: unknown
): { ok: true; address: CheckoutAddress } | { ok: false; message: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, message: "عنوان التوصيل مطلوب" };
  }
  const body = raw as Record<string, unknown>;
  const governorate = typeof body.governorate === "string" ? body.governorate.trim() : "";
  const city = typeof body.city === "string" ? body.city.trim() : "";
  const area = typeof body.area === "string" ? body.area.trim() : "";
  const street = typeof body.street === "string" ? body.street.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!governorate) return { ok: false, message: "المحافظة مطلوبة" };
  if (!city) return { ok: false, message: "المدينة مطلوبة" };
  if (!area) return { ok: false, message: "المنطقة مطلوبة" };
  if (!street) return { ok: false, message: "العنوان بالتفصيل مطلوب" };
  if (!phone) return { ok: false, message: "رقم هاتف التوصيل مطلوب" };
  const normalizedPhone = normalizeEgyptMobilePhone(phone);
  if (!normalizedPhone) return { ok: false, message: EGYPT_MOBILE_ERROR_MESSAGE };

  return {
    ok: true,
    address: {
      governorate,
      city,
      area,
      street,
      floor: body.floor != null ? String(body.floor) : null,
      apartment: body.apartment != null ? String(body.apartment) : null,
      notes: body.notes != null ? String(body.notes) : null,
      phone: normalizedPhone,
    },
  };
}
