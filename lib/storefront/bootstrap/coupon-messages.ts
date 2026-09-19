import { prisma } from "@/lib/db";

export type CouponPopupMessage = { id: string; message: string };

export type CouponPopupMessagesData = { messages: CouponPopupMessage[] };

/**
 * Shared body of `GET /api/promotions/coupon-popup-messages`, also used by
 * `GET /api/storefront/bootstrap` (backlog 6.2). Active coupons that opt in to a homepage-style
 * promotion message (non-empty).
 */
export async function getCouponPopupMessagesData(): Promise<CouponPopupMessagesData> {
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

  return { messages };
}
