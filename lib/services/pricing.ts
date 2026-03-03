/**
 * Pricing service: discounts (coupon) + senior buy-2-get-1-cheapest-free per 3 items.
 * Senior promo only applies when seniorPromoEnabled and seniorVerified.
 * Coupons are disabled when senior discount applies (no stacking).
 * All amounts in piastres (integer).
 */

import { prisma } from "@/lib/db";

export type LineInput = {
  variantId: string;
  quantity: number;
  unitPricePiastres: number;
};

export type PricingInput = {
  lines: LineInput[];
  couponCode?: string | null;
  seniorVerified: boolean;
  /** When false, senior discount is 0 regardless of seniorVerified */
  seniorPromoEnabled: boolean;
};

export type PricingResult = {
  subtotalPiastres: number;
  couponDiscountPiastres: number;
  seniorDiscountPiastres: number;
  totalDiscountPiastres: number;
  totalPiastres: number;
  appliedCouponCode: string | null;
};

/**
 * Compute senior discount: for every 3 units, the cheapest unit is free.
 * Units are taken across all lines (e.g. 2 of A + 4 of B = 6 units, 2 free).
 */
function computeSeniorDiscount(lines: LineInput[]): number {
  const units: number[] = [];
  for (const line of lines) {
    for (let i = 0; i < line.quantity; i++) {
      units.push(line.unitPricePiastres);
    }
  }
  if (units.length < 3) return 0;
  // Sort ascending; in each group of 3 the cheapest (first) is free
  units.sort((a, b) => a - b);
  let free = 0;
  for (let i = 0; i < units.length; i += 3) {
    if (i + 2 < units.length) free += units[i];
  }
  return free;
}

/**
 * Compute coupon discount from DB (validity, type, value, min order, max uses).
 */
async function getCouponDiscount(
  subtotalAfterSenior: number,
  code: string | null
): Promise<{ discount: number; appliedCode: string | null }> {
  if (!code?.trim()) return { discount: 0, appliedCode: null };

  const coupon = await prisma.coupon.findFirst({
    where: {
      code: code.trim().toUpperCase(),
      active: true,
      validFrom: { lte: new Date() },
      OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }],
    },
  });

  if (!coupon) return { discount: 0, appliedCode: null };
  if ((coupon.minOrderPiastres ?? 0) > subtotalAfterSenior)
    return { discount: 0, appliedCode: null };
  if (coupon.maxUses != null && coupon.usedCount >= coupon.maxUses)
    return { discount: 0, appliedCode: null };

  let discount: number;
  if (coupon.discountType === "PERCENT") {
    const value = Math.min(100, Math.max(0, coupon.discountValue));
    discount = Math.floor((subtotalAfterSenior * value) / 100);
  } else {
    discount = Math.min(coupon.discountValue, subtotalAfterSenior);
  }
  return { discount, appliedCode: coupon.code };
}

/**
 * Full pricing: subtotal, senior discount (if seniorPromoEnabled and seniorVerified), coupon discount, total.
 * When senior discount applies, coupon is not applied (UI + backend enforcement).
 */
export async function computePricing(input: PricingInput): Promise<PricingResult> {
  const subtotalPiastres = input.lines.reduce(
    (sum, l) => sum + l.quantity * l.unitPricePiastres,
    0
  );

  const seniorDiscountPiastres =
    input.seniorPromoEnabled && input.seniorVerified
      ? computeSeniorDiscount(input.lines)
      : 0;

  const subtotalAfterSenior = Math.max(0, subtotalPiastres - seniorDiscountPiastres);

  // Coupons disabled when senior promo applies (no stacking)
  const couponCodeWhenSeniorApplies =
    seniorDiscountPiastres > 0 ? null : input.couponCode ?? null;

  const { discount: couponDiscountPiastres, appliedCode: appliedCouponCode } =
    await getCouponDiscount(subtotalAfterSenior, couponCodeWhenSeniorApplies);

  const totalDiscountPiastres = seniorDiscountPiastres + couponDiscountPiastres;
  const totalPiastres = Math.max(0, subtotalPiastres - totalDiscountPiastres);

  return {
    subtotalPiastres,
    couponDiscountPiastres,
    seniorDiscountPiastres,
    totalDiscountPiastres,
    totalPiastres,
    appliedCouponCode,
  };
}
