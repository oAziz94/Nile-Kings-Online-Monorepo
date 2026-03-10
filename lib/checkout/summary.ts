/**
 * Checkout summary: cart + address + coupon → subtotal, discounts, shipping (Egypt Post Phase 1), cod, finalTotal.
 */

import { prisma } from "@/lib/db";
import { getPhase1ShippingFee, PHASE1_SHIPPING_PROVIDER_DISPLAY } from "@/lib/services/shipping";
import { computePricing } from "@/lib/services/pricing";
import { isSeniorPromoEnabled } from "@/lib/settings";
import type { CheckoutAddress, CheckoutSummary } from "./types";
import { getCodFeePercent } from "@/lib/settings";

export type SummaryInput = {
  userId: string;
  address: CheckoutAddress;
  couponCode?: string | null;
  paymentMethod?: "COD" | "PAYMOB" | "INSTAPAY_PREPAID";
};

/**
 * Build checkout summary from user's cart. Requires auth (userId).
 * Phase 1: shipping is Egypt Post Wasalha only; no provider choice.
 * Returns null if cart empty, any product has missing weight, or shipping cannot be calculated for address/zone.
 */
export async function buildCheckoutSummary(
  input: SummaryInput
): Promise<CheckoutSummary | null> {
  const cart = await prisma.cart.findFirst({
    where: { userId: input.userId },
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: { select: { weightGrams: true } },
            },
          },
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) return null;

  // Phase 1: if any product has missing weight, shipping cannot be calculated
  let weightGrams = 0;
  for (const i of cart.items) {
    const w = i.variant.product?.weightGrams;
    if (w == null || w < 0) return null;
    weightGrams += i.quantity * w;
  }

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { seniorVerified: true },
  });
  const seniorVerified = user?.seniorVerified ?? false;
  const seniorPromoEnabled = await isSeniorPromoEnabled();

  const lines = cart.items.map((i) => ({
    variantId: i.variant.id,
    quantity: i.quantity,
    unitPricePiastres: i.variant.pricePiastres,
  }));

  const pricing = await computePricing({
    lines,
    couponCode: input.couponCode ?? null,
    seniorVerified,
    seniorPromoEnabled,
  });

  const shippingOption = getPhase1ShippingFee(
    {
      governorate: input.address.governorate,
      city: input.address.city,
      area: input.address.area,
    },
    weightGrams
  );

  if (!shippingOption) return null;

  // COD: رسوم الاستلام = % of (items + shipping). InstaPay prepaid: no رسوم الاستلام.
  const orderBeforeCodPiastres = pricing.totalPiastres + shippingOption.feePiastres;
  const codFeePercent = await getCodFeePercent();
  const codFee =
    input.paymentMethod === "COD"
      ? Math.round((orderBeforeCodPiastres * codFeePercent) / 100)
      : 0;
  const finalTotal =
    pricing.totalPiastres + shippingOption.feePiastres + codFee;

  return {
    subtotal: pricing.subtotalPiastres,
    couponDiscount: pricing.couponDiscountPiastres,
    seniorFreeValue: pricing.seniorDiscountPiastres,
    shippingFee: shippingOption.feePiastres,
    codFee,
    finalTotal,
    appliedCouponCode: pricing.appliedCouponCode,
    shippingProvider: PHASE1_SHIPPING_PROVIDER_DISPLAY,
    paymentMethod: input.paymentMethod,
  };
}
