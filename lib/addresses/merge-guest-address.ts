/**
 * Guest -> account address migration: mirrors mergeGuestCartIntoUser (lib/cart/cart.ts).
 * If the guest filled in a complete address in the location modal before signing up/in,
 * turn it into a real default saved address instead of losing it.
 */

import { getStorefrontAddressFromCookies } from "@/lib/storefront-location";
import { isCheckoutAddressComplete } from "@/lib/addresses/completeness";
import { createSavedAddress } from "@/lib/addresses/create";

export async function mergeGuestAddressIntoUser(userId: string): Promise<void> {
  const address = await getStorefrontAddressFromCookies();
  if (!address || !isCheckoutAddressComplete(address)) return;

  await createSavedAddress(userId, {
    label: address.label,
    governorate: address.governorate,
    city: address.city ?? "",
    area: address.area,
    street: address.street ?? "",
    building: address.building,
    floor: address.floor,
    apartment: address.apartment,
    phone: address.phone ?? "",
    isDefault: true,
  });
}
