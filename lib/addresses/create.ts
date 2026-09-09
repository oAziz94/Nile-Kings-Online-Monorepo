/**
 * Shared saved-address creation: same validation/normalization used by the customer's
 * own "add address" form (app/api/profile/addresses/route.ts), the location modal
 * (app/api/storefront/governorate/route.ts) and the guest->account address migration
 * (lib/addresses/merge-guest-address.ts) — kept in one place instead of duplicated.
 */

import type { SavedAddress } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";

export type CreateSavedAddressInput = {
  label?: string | null;
  governorate: string;
  city: string;
  area?: string | null;
  street: string;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
  notes?: string | null;
  phone: string;
  isDefault?: boolean;
};

export type CreateSavedAddressResult =
  | { ok: true; address: SavedAddress }
  | { ok: false; error: string };

export async function createSavedAddress(
  userId: string,
  input: CreateSavedAddressInput
): Promise<CreateSavedAddressResult> {
  if (!input.governorate?.trim()) return { ok: false, error: "المحافظة مطلوبة" };
  if (!input.city?.trim()) return { ok: false, error: "المدينة مطلوبة" };
  if (!input.area?.trim()) return { ok: false, error: "المنطقة مطلوبة" };
  if (!input.street?.trim()) return { ok: false, error: "العنوان بالتفصيل مطلوب" };
  if (!input.phone?.trim()) return { ok: false, error: "رقم الهاتف مطلوب" };

  const normalizedPhone = normalizeEgyptMobilePhone(input.phone);
  if (!normalizedPhone) return { ok: false, error: EGYPT_MOBILE_ERROR_MESSAGE };

  if (input.isDefault) {
    await prisma.savedAddress.updateMany({
      where: { userId },
      data: { isDefault: false },
    });
  }

  const address = await prisma.savedAddress.create({
    data: {
      userId,
      label: input.label?.trim() || null,
      governorate: input.governorate.trim(),
      city: input.city.trim(),
      area: input.area?.trim() || null,
      street: input.street.trim(),
      building: input.building?.trim() || null,
      floor: input.floor?.trim() || null,
      apartment: input.apartment?.trim() || null,
      notes: input.notes?.trim() || null,
      phone: normalizedPhone,
      isDefault: !!input.isDefault,
    },
  });

  return { ok: true, address };
}
