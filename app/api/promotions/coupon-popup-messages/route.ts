import { apiSuccess } from "@/lib/api/response";
import { getCouponPopupMessagesData } from "@/lib/storefront/bootstrap/coupon-messages";

/**
 * GET /api/promotions/coupon-popup-messages
 * Public: active coupons that opt in to a homepage-style promotion message (non-empty).
 */
export async function GET() {
  const data = await getCouponPopupMessagesData();
  return apiSuccess(data);
}
