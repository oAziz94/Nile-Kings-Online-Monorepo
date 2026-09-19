import { apiSuccess } from "@/lib/api/response";
import { getAuthMeData } from "@/lib/storefront/bootstrap/auth-me";
import { getGovernorateBootstrapData } from "@/lib/storefront/bootstrap/governorate";
import { getCouponPopupMessagesData } from "@/lib/storefront/bootstrap/coupon-messages";
import { getCurrentCartPayload } from "@/lib/cart/cart";

/**
 * GET /api/storefront/bootstrap (backlog 6.2)
 *
 * One request for everything the public layout needs on first paint, replacing four separate
 * client fetches (`/api/auth/me`, `/api/storefront/governorate`, `/api/promotions/coupon-popup-messages`,
 * `/api/cart`) — same reads, same shapes per sub-object, run in parallel. Those four endpoints stay
 * in place for their write/refresh paths (save address, add to cart, logout, drawer-open refresh);
 * this route only replaces their shared *first* read on every storefront page view.
 *
 * `user` is `null` for a guest (not a 401) — unlike `/api/auth/me`, a guest here isn't an error.
 * Always fresh: never cached, no ISR.
 */
export const dynamic = "force-dynamic";

async function safeCart() {
  try {
    return await getCurrentCartPayload();
  } catch (e) {
    console.error("GET /api/storefront/bootstrap (cart)", e);
    return null;
  }
}

export async function GET() {
  const [user, governorate, couponMessages, cart] = await Promise.all([
    getAuthMeData(),
    getGovernorateBootstrapData(),
    getCouponPopupMessagesData(),
    safeCart(),
  ]);

  const response = apiSuccess({ user, governorate, couponMessages, cart });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
