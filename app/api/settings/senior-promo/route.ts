import { isSeniorPromoEnabled } from "@/lib/settings";
import { apiSuccess } from "@/lib/api/response";

/**
 * GET /api/settings/senior-promo
 * Public: whether senior promotion is enabled (for UI: badge, cart message, coupon disable).
 */
export async function GET() {
  const enabled = await isSeniorPromoEnabled();
  return apiSuccess({ enabled });
}
