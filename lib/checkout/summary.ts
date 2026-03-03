/**
 * Checkout summary: cart + address + provider + coupon → subtotal, discounts, shipping, cod, finalTotal.
 */

import { prisma } from "@/lib/db";
import { getShippingFeeForProvider } from "@/lib/services/shipping";
import { computePricing } from "@/lib/services/pricing";
import { isSeniorPromoEnabled } from "@/lib/settings";
import type { CheckoutAddress, CheckoutSummary } from "./types";
import { DEFAULT_ITEM_WEIGHT_GRAMS } from "./types";
import { getCodFeePiastres } from "@/lib/settings";

export type SummaryInput = {
  userId: string;
  address: CheckoutAddress;
  provider: string;
  couponCode?: string | null;
  paymentMethod?: "COD" | "PAYMOB";
};

/**
 * Build checkout summary from user's cart. Requires auth (userId).
 * Returns null if cart empty or shipping rule not found for provider+address+weight.
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

  const weightGrams = cart.items.reduce(
    (sum, i) =>
      sum +
      i.quantity * (i.variant.product?.weightGrams ?? DEFAULT_ITEM_WEIGHT_GRAMS),
    0
  );
  const shippingOption = await getShippingFeeForProvider(
    input.provider,
    {
      governorate: input.address.governorate,
      city: input.address.city,
      area: input.address.area,
    },
    weightGrams
  );

  if (!shippingOption) return null;

  const codFeePiastres = await getCodFeePiastres();
  const codFee = input.paymentMethod === "COD" ? codFeePiastres : 0;
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
    shippingProvider: input.provider,
    paymentMethod: input.paymentMethod,
  };
}
