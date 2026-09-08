/**
 * Place order: transaction-safe reserve (stockReserved += qty), create Order CREATED, then commit for COD/Paymob.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { InsufficientStockError } from "@/lib/services/stock";
import {
  commitPartnerReservation,
  findFulfillablePartnerForGovernorate,
  InsufficientPartnerStockError,
  reservePartnerStockForOrder,
} from "@/lib/inventory/partner-inventory";
import { logOrderCreated, logOrderConfirmed } from "@/lib/audit/order-audit";
import { buildCheckoutSummary, buildCheckoutSummaryFromLines } from "./summary";
import { PHASE1_SHIPPING_PROVIDER_DISPLAY } from "@/lib/services/shipping";
import type { CheckoutAddress } from "./types";
import type { SummaryLineInput } from "./summary";

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

/** Item display: productSlug-size-colorName (e.g. test-M-اسود) */
function variantDisplayName(
  productSlug: string,
  size: string,
  colorName: string | null | undefined
): string {
  const base = `${productSlug}-${size}`;
  return colorName?.trim() ? `${base}-${colorName.trim()}` : base;
}

export type PlaceOrderInput = {
  userId: string;
  address: CheckoutAddress;
  paymentMethod: "COD" | "PAYMOB" | "INSTAPAY_PREPAID";
  couponCode?: string | null;
  /** Admin: explicit lines instead of user cart */
  lines?: SummaryLineInput[];
  /** Admin: do not clear the customer's cart */
  skipCartClear?: boolean;
  adminNotes?: string | null;
  selectedPartnerId?: string | null;
  /** True when this order is being created from the admin dashboard, not storefront checkout. */
  createdByAdmin?: boolean;
  /**
   * Storefront: the governorate the customer chose in the delivery-location picker (not the
   * shipping address). Partner resolution must key off this, never the address's governorate —
   * a customer who picked Cairo but ships to a relative in Giza still gets Cairo's partner.
   * Admin-created orders have no storefront session and omit this, falling back to the
   * address's governorate below.
   */
  selectedGovernorate?: string | null;
};

export type OutOfStockItem = {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
};

export type PlaceOrderResult =
  | { success: true; orderId: string; status: "CREATED" | "CONFIRMED" }
  | { success: false; error: string; code?: string; outOfStockItems?: OutOfStockItem[] };

type OrderLineRow = {
  variantId: string;
  quantity: number;
  productName: string;
  variantName: string;
  sku: string;
  unitPricePiastres: number;
  totalPiastres: number;
};

/**
 * Place order: in one Prisma transaction:
 * - Lock variant rows, ensure available >= qty, increase stockReserved
 * - Create Order (status CREATED) for InstaPay; admin confirms or cancels (no auto-expiry)
 * - Create OrderItems
 * - If COD or PAYMOB dummy: commit reservation, set CONFIRMED, record payment. If INSTAPAY_PREPAID: order stays CREATED, payment PENDING.
 * - Record coupon usage if applied
 * - Clear user cart (unless skipCartClear)
 */
export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const summaryInput = {
    userId: input.userId,
    address: input.address,
    couponCode: input.couponCode,
    paymentMethod: input.paymentMethod,
  };

  const summary = input.lines?.length
    ? await buildCheckoutSummaryFromLines({ ...summaryInput, lines: input.lines })
    : await buildCheckoutSummary(summaryInput);

  if (!summary) {
    return {
      success: false,
      error: input.lines?.length
        ? "تعذر حساب الطلب: صنف غير متاح، وزن ناقص، أو لا يمكن حساب الشحن لهذا العنوان"
        : "السلة فارغة، أو وزن منتج ناقص، أو لا يمكن حساب الشحن لهذا العنوان",
      code: "INVALID_CHECKOUT",
    };
  }

  let orderLines: OrderLineRow[];
  let cartId: string | null = null;

  if (input.lines?.length) {
    const variantIds = [...new Set(input.lines.map((l) => l.variantId))];
    const variants = await prisma.variant.findMany({
      where: { id: { in: variantIds } },
      include: { product: { select: { name: true, slug: true, active: true } } },
    });
    const byId = new Map(variants.map((v) => [v.id, v]));

    orderLines = [];
    for (const line of input.lines) {
      const v = byId.get(line.variantId);
      if (!v || !v.product.active) {
        return { success: false, error: "صنف غير متاح في الطلب", code: "INVALID_ITEM" };
      }
      const p = v.product;
      orderLines.push({
        variantId: v.id,
        quantity: line.quantity,
        productName: p.name,
        variantName: variantDisplayName(p.slug, v.name, v.colorName),
        sku: v.sku,
        unitPricePiastres: v.pricePiastres,
        totalPiastres: line.quantity * v.pricePiastres,
      });
    }
  } else {
    const cart = await prisma.cart.findFirst({
      where: { userId: input.userId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: { select: { name: true, slug: true, active: true } },
              },
            },
          },
        },
      },
    });

    if (!cart || cart.items.length === 0) {
      return { success: false, error: "السلة فارغة", code: "EMPTY_CART" };
    }
    cartId = cart.id;

    orderLines = [];
    for (const i of cart.items) {
      const v = i.variant;
      const p = v.product;
      if (!p.active) {
        return { success: false, error: "صنف غير متاح في الطلب", code: "INVALID_ITEM" };
      }
      orderLines.push({
        variantId: v.id,
        quantity: i.quantity,
        productName: p.name,
        variantName: variantDisplayName(p.slug, v.name, v.colorName),
        sku: v.sku,
        unitPricePiastres: v.pricePiastres,
        totalPiastres: i.quantity * v.pricePiastres,
      });
    }
  }

  if (!totalsFitDbInt(summary)) {
    return {
      success: false,
      error: "قيمة الطلب تتجاوز الحد المسموح. قلّل الكميات أو قسّم الطلب.",
      code: "ORDER_TOTAL_TOO_LARGE",
    };
  }

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
  const selectedPartner = await findFulfillablePartnerForGovernorate({
    governorate: input.selectedGovernorate ?? input.address.governorate,
    lines: stockLines,
    preferredPartnerId: input.selectedPartnerId ?? null,
  });
  if (!selectedPartner.ok) {
    if (selectedPartner.reason === "INSUFFICIENT_STOCK") {
      const insufficientIds = new Set(selectedPartner.insufficientVariantIds);
      const outOfStockItems: OutOfStockItem[] = orderLines
        .filter((line) => insufficientIds.has(line.variantId))
        .map((line) => ({
          variantId: line.variantId,
          sku: line.sku,
          productName: line.productName,
          variantName: line.variantName,
        }));
      return {
        success: false,
        error: `الأصناف التالية غير متوفرة حالياً، برجاء إزالتها من السلة: ${outOfStockItems
          .map((item) => item.variantName)
          .join("، ")}`,
        code: "INSUFFICIENT_STOCK",
        outOfStockItems,
      };
    }
    return {
      success: false,
      error: "الأصناف المطلوبة غير متوفرة لدى شريك واحد في هذه المحافظة",
      code: "NO_PARTNER_CAN_FULFILL_CART",
    };
  }
  const immediateConfirm = input.paymentMethod === "COD" || input.paymentMethod === "PAYMOB";
  const isInstaPayPrepaid = input.paymentMethod === "INSTAPAY_PREPAID";
  const adminNotes =
    typeof input.adminNotes === "string" && input.adminNotes.trim()
      ? input.adminNotes.trim()
      : null;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.create({
          data: {
            userId: input.userId,
            status: immediateConfirm ? "CONFIRMED" : "CREATED",
            subtotalPiastres: summary.subtotal,
            discountPiastres: summary.couponDiscount,
            seniorFreeValuePiastres: summary.seniorFreeValue,
            shippingPiastres: summary.shippingFee,
            carrierShippingPiastres: summary.carrierShippingFee,
            codFeePiastres: summary.codFee,
            totalPiastres: summary.finalTotal,
            shippingAddress: input.address as object,
            shippingProvider: PHASE1_SHIPPING_PROVIDER_DISPLAY,
            paymentMethod: input.paymentMethod,
            couponCode: summary.appliedCouponCode ?? undefined,
            reservationExpiresAt: null,
            adminNotes: adminNotes ?? undefined,
            assignedPartnerId: selectedPartner.partnerId,
            shippingOriginGovernorate: selectedPartner.originGovernorate,
          },
        });

        const stockActorNotes = input.createdByAdmin ? "Admin order creation" : "Customer checkout";
        await reservePartnerStockForOrder(tx, selectedPartner.partnerId, stockLines, order.id, stockActorNotes);

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

        if (immediateConfirm) {
          await commitPartnerReservation(tx, selectedPartner.partnerId, stockLines, order.id, stockActorNotes);
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

        if (cartId && !input.skipCartClear) {
          await tx.cartItem.deleteMany({ where: { cartId } });
        }

        return { orderId: order.id, status: order.status };
      },
      {
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
    if (e instanceof InsufficientStockError || e instanceof InsufficientPartnerStockError) {
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
