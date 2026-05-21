/**
 * Checkout: address, provider, payment, summary types.
 */

import { SHIPPING_PROVIDERS } from "@/lib/services/shipping";

export const PAYMENT_METHODS = ["COD", "PAYMOB", "INSTAPAY_PREPAID"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Checkout UI: only COD and InstaPay prepaid. */
export const CHECKOUT_PAYMENT_OPTIONS = [
  { value: "COD" as const, label: "الدفع عند الاستلام" },
  { value: "INSTAPAY_PREPAID" as const, label: "الدفع عبر InstaPay" },
] as const;

export type CheckoutAddress = {
  governorate: string;
  city: string;
  area?: string | null;
  street: string;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
  notes?: string | null;
  phone: string; // delivery contact
};

export type ShippingProvider = (typeof SHIPPING_PROVIDERS)[number];

export type CheckoutSummary = {
  subtotal: number;
  couponDiscount: number;
  seniorFreeValue: number;
  /** Customer shipping (carrier + margin + prep). */
  shippingFee: number;
  /** Wasalha carrier fee only (courier-facing). */
  carrierShippingFee: number;
  codFee: number;
  finalTotal: number;
  appliedCouponCode: string | null;
  shippingProvider: string;
  paymentMethod?: PaymentMethod;
};

/** Default weight per cart item in grams when product weight is unknown. */
export const DEFAULT_ITEM_WEIGHT_GRAMS = 500;

/** COD fee in piastres (configurable). */
export const COD_FEE_PIASTRES = 0;
