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

export type SummaryLineInput = { variantId: string; quantity: number };

async function buildSummaryFromPricingLines(
  input: SummaryInput,
  lines: { variantId: string; quantity: number; unitPricePiastres: number }[],
  weightGrams: number
): Promise<CheckoutSummary | null> {
  if (lines.length === 0 || weightGrams < 0) return null;

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { seniorVerified: true },
  });
  const seniorVerified = user?.seniorVerified ?? false;
  const seniorPromoEnabled = await isSeniorPromoEnabled();

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

  const orderBeforeCodPiastres = pricing.totalPiastres + shippingOption.feePiastres;
  const codFeePercent = await getCodFeePercent();
  const codFee =
    input.paymentMethod === "COD"
      ? Math.round((orderBeforeCodPiastres * codFeePercent) / 100)
      : 0;
  const finalTotal = pricing.totalPiastres + shippingOption.feePiastres + codFee;

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

/**
 * Build checkout summary from explicit line items (admin order create).
 */
export async function buildCheckoutSummaryFromLines(
  input: SummaryInput & { lines: SummaryLineInput[] }
): Promise<CheckoutSummary | null> {
  if (input.lines.length === 0) return null;

  const variantIds = [...new Set(input.lines.map((l) => l.variantId))];
  const variants = await prisma.variant.findMany({
    where: { id: { in: variantIds } },
    include: { product: { select: { weightGrams: true, active: true } } },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));

  let weightGrams = 0;
  const pricingLines: { variantId: string; quantity: number; unitPricePiastres: number }[] = [];

  for (const line of input.lines) {
    const variant = byId.get(line.variantId);
    if (!variant || !variant.product.active) return null;
    const w = variant.product.weightGrams;
    if (w == null || w < 0) return null;
    weightGrams += line.quantity * w;
    pricingLines.push({
      variantId: line.variantId,
      quantity: line.quantity,
      unitPricePiastres: variant.pricePiastres,
    });
  }

  return buildSummaryFromPricingLines(input, pricingLines, weightGrams);
}

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
              product: { select: { weightGrams: true, active: true } },
            },
          },
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) return null;

  let weightGrams = 0;
  const pricingLines: { variantId: string; quantity: number; unitPricePiastres: number }[] = [];

  for (const i of cart.items) {
    const w = i.variant.product?.weightGrams;
    if (w == null || w < 0 || !i.variant.product.active) return null;
    weightGrams += i.quantity * w;
    pricingLines.push({
      variantId: i.variant.id,
      quantity: i.quantity,
      unitPricePiastres: i.variant.pricePiastres,
    });
  }

  return buildSummaryFromPricingLines(input, pricingLines, weightGrams);
}
