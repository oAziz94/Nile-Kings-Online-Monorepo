import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";

/**
 * GET /api/promotions/coupon-popup-messages
 * Public: active coupons that opt in to a homepage-style promotion message (non-empty).
 */
export async function GET() {
  const now = new Date();
  const coupons = await prisma.coupon.findMany({
    where: {
      active: true,
      showPromotionPopup: true,
      validFrom: { lte: now },
      OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      NOT: { promotionPopupMessage: null },
    },
    select: { id: true, promotionPopupMessage: true },
    orderBy: { createdAt: "desc" },
  });

  const messages = coupons
    .map((c) => ({
      id: c.id,
      message: (c.promotionPopupMessage ?? "").trim(),
    }))
    .filter((m) => m.message.length > 0);

  return apiSuccess({ messages });
}
