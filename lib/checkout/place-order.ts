/**
 * Place order: transaction-safe reserve (stockReserved += qty), create Order CREATED, then commit for COD/Paymob.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { reserveStockForOrder, commitReservation, InsufficientStockError } from "@/lib/services/stock";
import { logOrderCreated, logOrderConfirmed } from "@/lib/audit/order-audit";
import { buildCheckoutSummary } from "./summary";
import { PHASE1_SHIPPING_PROVIDER_DISPLAY } from "@/lib/services/shipping";
import type { CheckoutAddress } from "./types";

const RESERVATION_MINUTES = 15;

/** Postgres `Int` columns — totals must fit or Prisma throws at persist time. */
const INT32_MAX = 2_147_483_647;

function totalsFitDbInt(summary: {
  subtotal: number;
  couponDiscount: number;
  seniorFreeValue: number;
  shippingFee: number;
  codFee: number;
  finalTotal: number;
}): boolean {
  const fields = [
    summary.subtotal,
    summary.couponDiscount,
    summary.seniorFreeValue,
    summary.shippingFee,
    summary.codFee,
    summary.finalTotal,
  ];
  return fields.every((n) => Number.isFinite(n) && n >= 0 && n <= INT32_MAX);
}

export type PlaceOrderInput = {
  userId: string;
  address: CheckoutAddress;
  paymentMethod: "COD" | "PAYMOB" | "INSTAPAY_PREPAID";
  couponCode?: string | null;
};

export type PlaceOrderResult =
  | { success: true; orderId: string; status: "CREATED" | "CONFIRMED" }
  | { success: false; error: string; code?: string };

/**
 * Place order: in one Prisma transaction:
 * - Lock variant rows, ensure available >= qty, increase stockReserved
 * - Create Order (status CREATED) with reservationExpiresAt = now + 15m
 * - Create OrderItems
 * - If COD or PAYMOB dummy: commit reservation, set CONFIRMED, record payment. If INSTAPAY_PREPAID: order stays CREATED, payment PENDING.
 * - Record coupon usage if applied
 * - Clear user cart
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const summary = await buildCheckoutSummary({
    userId: input.userId,
    address: input.address,
    couponCode: input.couponCode,
    paymentMethod: input.paymentMethod,
  });

  if (!summary) {
    return { success: false, error: "Cart is empty, a product is missing weight, or shipping cannot be calculated for this address", code: "INVALID_CHECKOUT" };
  }

  const cart = await prisma.cart.findFirst({
    where: { userId: input.userId },
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: { select: { name: true, slug: true } },
            },
          },
        },
      },
    },
  });

  if (!cart || cart.items.length === 0) {
    return { success: false, error: "Cart is empty", code: "EMPTY_CART" };
  }

  if (!totalsFitDbInt(summary)) {
    return {
      success: false,
      error: "قيمة الطلب تتجاوز الحد المسموح. قلّل الكميات أو قسّم الطلب.",
      code: "ORDER_TOTAL_TOO_LARGE",
    };
  }

  /** Item display: productSlug-size-colorName (e.g. test-M-اسود) */
  function variantDisplayName(
    productSlug: string,
    size: string,
    colorName: string | null | undefined
  ): string {
    const base = `${productSlug}-${size}`;
    return colorName?.trim() ? `${base}-${colorName.trim()}` : base;
  }

  const orderLines = cart.items.map((i) => {
    const v = i.variant;
    const p = v.product;
    return {
      variantId: v.id,
      quantity: i.quantity,
      productName: p.name,
      variantName: variantDisplayName(p.slug, v.name, v.colorName),
      sku: v.sku,
      unitPricePiastres: v.pricePiastres,
      totalPiastres: i.quantity * v.pricePiastres,
    };
  });

  for (const line of orderLines) {
    if (
      line.quantity < 1 ||
      !Number.isFinite(line.unitPricePiastres) ||
      !Number.isFinite(line.totalPiastres) ||
      line.unitPricePiastres < 0 ||
      line.unitPricePiastres > INT32_MAX ||
      line.totalPiastres < 0 ||
      line.totalPiastres > INT32_MAX
    ) {
      return {
        success: false,
        error: "قيمة الطلب تتجاوز الحد المسموح. قلّل الكميات أو قسّم الطلب.",
        code: "LINE_AMOUNT_TOO_LARGE",
      };
    }
  }

  const stockLines = orderLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
  const reservationExpiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000);
  const immediateConfirm = input.paymentMethod === "COD" || input.paymentMethod === "PAYMOB";
  const isInstaPayPrepaid = input.paymentMethod === "INSTAPAY_PREPAID";

  try {
    const result = await prisma.$transaction(
      async (tx) => {
      // 1) Reserve stock (lock + increment stockReserved only)
      await reserveStockForOrder(tx, stockLines);

      // 2) Create order
      const order = await tx.order.create({
        data: {
          userId: input.userId,
          status: immediateConfirm ? "CONFIRMED" : "CREATED",
          subtotalPiastres: summary.subtotal,
          discountPiastres: summary.couponDiscount,
          seniorFreeValuePiastres: summary.seniorFreeValue,
          shippingPiastres: summary.shippingFee,
          codFeePiastres: summary.codFee,
          totalPiastres: summary.finalTotal,
          shippingAddress: input.address as object,
          shippingProvider: PHASE1_SHIPPING_PROVIDER_DISPLAY,
          paymentMethod: input.paymentMethod,
          couponCode: summary.appliedCouponCode ?? undefined,
          reservationExpiresAt: immediateConfirm ? null : reservationExpiresAt,
        },
      });

      // 3) Create order items
      await tx.orderItem.createMany({
        data: orderLines.map((line) => ({
          orderId: order.id,
          variantId: line.variantId,
          productName: line.productName,
          variantName: line.variantName,
          sku: line.sku,
          quantity: line.quantity,
          unitPricePiastres: line.unitPricePiastres,
          totalPiastres: line.totalPiastres,
        })),
      });

      await logOrderCreated(tx, order.id);
      if (immediateConfirm) await logOrderConfirmed(tx, order.id);

      // 4) If COD or Paymob: commit reservation and payment. If InstaPay prepaid: record PENDING attempt.
      if (immediateConfirm) {
        await commitReservation(tx, stockLines);
        await tx.paymentAttempt.create({
          data: {
            orderId: order.id,
            status: "CAPTURED",
            amountPiastres: summary.finalTotal,
            provider: input.paymentMethod,
            providerRef: input.paymentMethod === "PAYMOB" ? `dummy-${order.id}` : undefined,
          },
        });
      } else if (isInstaPayPrepaid) {
        await tx.paymentAttempt.create({
          data: {
            orderId: order.id,
            status: "PENDING",
            amountPiastres: summary.finalTotal,
            provider: "INSTAPAY_PREPAID",
            providerRef: undefined,
          },
        });
      }

      // 5) Coupon usage
      if (summary.appliedCouponCode) {
        const coupon = await tx.coupon.findFirst({
          where: { code: summary.appliedCouponCode },
        });
        if (coupon) {
          await tx.couponUsage.create({
            data: {
              couponId: coupon.id,
              userId: input.userId,
              orderId: order.id,
            },
          });
          await tx.coupon.update({
            where: { id: coupon.id },
            data: { usedCount: { increment: 1 } },
          });
        }
      }

      // 6) Clear cart
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });

      return { orderId: order.id, status: order.status };
    },
      {
        // Default 5s is too tight for large carts (many stock updates per line).
        maxWait: 15_000,
        timeout: 60_000,
      }
    );

    return {
      success: true,
      orderId: result.orderId,
      status: result.status as "CREATED" | "CONFIRMED",
    };
  } catch (e) {
    if (e instanceof InsufficientStockError) {
      return {
        success: false,
        error: `Insufficient stock for item`,
        code: "INSUFFICIENT_STOCK",
      };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[placeOrder] Prisma error", e.code, e.meta, e.message);
      if (e.code === "P2028" || e.code === "P2034") {
        return {
          success: false,
          error:
            "استغرقت معالجة الطلب وقتاً أطول من المتوقع (سلة كبيرة أو ازدحام). أعد المحاولة بعد لحظات.",
          code: e.code === "P2034" ? "TRANSACTION_CONFLICT" : "TRANSACTION_TIMEOUT",
        };
      }
      return {
        success: false,
        error: "تعذر إتمام الطلب. إذا تكرر ذلك، تواصل مع الدعم.",
        code: "ORDER_PERSIST_FAILED",
      };
    }
    throw e;
  }
}
