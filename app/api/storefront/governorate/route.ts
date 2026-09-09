import { NextRequest } from "next/server";
import { apiBadRequest, apiSuccess } from "@/lib/api/response";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import {
  normalizeStorefrontGovernorate,
  getStorefrontAddressFromCookies,
  STOREFRONT_LOCATION_COOKIE,
  type StorefrontAddress,
} from "@/lib/storefront-location";
import { isCheckoutAddressComplete } from "@/lib/addresses/completeness";
import { createSavedAddress } from "@/lib/addresses/create";
import { pruneCartItemsForGovernorate } from "@/lib/cart/prune-for-governorate";
import { getOrCreateCart } from "@/lib/cart/cart";
import { getCurrentUser } from "@/lib/auth/session";

const MAX_AGE_SEC = 60 * 60 * 24 * 180;

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
  const address = await getStorefrontAddressFromCookies();
  return apiSuccess({ address, options: GOVERNORATE_OPTIONS });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const governorate = normalizeStorefrontGovernorate(readOptionalString(body.governorate));
  if (!governorate) return apiBadRequest("اختر محافظة صحيحة");

  const address: StorefrontAddress = {
    governorate,
    area: readOptionalString(body.area),
    city: readOptionalString(body.city),
    street: readOptionalString(body.street),
    building: readOptionalString(body.building),
    floor: readOptionalString(body.floor),
    apartment: readOptionalString(body.apartment),
    phone: readOptionalString(body.phone),
    label: readOptionalString(body.label),
  };

  // Governorate changed (or first pick): the partner behind the cart may have changed too —
  // drop anything the new partner has zero stock for so the cart never silently holds
  // unfulfillable items.
  const { cartId } = await getOrCreateCart();
  const removedItems = await pruneCartItemsForGovernorate(cartId, governorate);

  // A complete address (same fields checkout requires) becomes a real saved address for a
  // signed-in customer immediately, set as their default.
  const user = await getCurrentUser();
  if (user?.userId && isCheckoutAddressComplete(address)) {
    await createSavedAddress(user.userId, {
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

  const response = apiSuccess({ governorate, removedItems }, "تم حفظ العنوان");
  response.cookies.set({
    name: STOREFRONT_LOCATION_COOKIE,
    value: JSON.stringify(address),
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SEC,
  });
  response.headers.set("Cache-Control", "no-store, must-revalidate");
  return response;
}
