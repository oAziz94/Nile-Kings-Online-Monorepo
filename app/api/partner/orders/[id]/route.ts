import { NextRequest } from "next/server";
import { Prisma, type OrderStatus } from "@prisma/client";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { getPhase1ShippingFee, PHASE1_SHIPPING_PROVIDER_DISPLAY } from "@/lib/services/shipping";
import { getCodFeePercent, isSeniorPromoEnabled } from "@/lib/settings";
import { computeCodFeePiastres } from "@/lib/checkout/cod-fee";
import { computePricing } from "@/lib/services/pricing";
import { stockLinesEquivalent, type StockLine } from "@/lib/services/stock";
import {
  commitPartnerReservation,
  InsufficientPartnerStockError,
  reconcilePartnerStockForAdminOrderItemEdit,
  releasePartnerReservation,
  restorePartnerCommittedStock,
  orderUsesPartnerReservationOnly,
} from "@/lib/inventory/partner-inventory";
import { logOrderCancelled, logOrderConfirmed, logOrderStatusChange } from "@/lib/audit/order-audit";

const ORDER_STATUSES = ["CREATED", "CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
const INT32_MAX = 2_147_483_647;

const orderInclude = {
  user: { select: { id: true, phone: true, name: true, email: true } },
  items: {
    include: {
      variant: {
        select: {
          imageUrl: true,
          product: { select: { imageUrl: true } },
        },
      },
    },
  },
  routedOrder: true,
} as const;

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
type Params = { params: Promise<{ id: string }> };
type IncomingItem = { variantId: string; quantity: number };

function mapOrder(order: OrderRow) {
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      imageUrl: item.variant.imageUrl ?? item.variant.product.imageUrl ?? null,
      variant: undefined,
    })),
  };
}

async function requireAgentPartner() {
  const user = await requirePartner();
  const partner = await prisma.partner.findUnique({
    where: { id: user.partnerId },
    select: { partnerType: true },
  });
  if (partner?.partnerType !== "AGENT") {
    const err = new Error("FORBIDDEN");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return user;
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireAgentPartner();
    const { id } = await params;
    const order = await prisma.order.findFirst({
      where: { id, assignedPartnerId: user.partnerId },
      include: orderInclude,
    });
    if (!order) return apiNotFound("الطلب غير موجود");
    return apiSuccess(mapOrder(order));
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireAgentPartner();
    const { id } = await params;
    const existing = await prisma.order.findFirst({
      where: { id, assignedPartnerId: user.partnerId },
      include: { items: true },
    });
    if (!existing) return apiNotFound("الطلب غير موجود");

    let body: { status?: string; adminNotes?: string | null; items?: IncomingItem[] };
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("جسم الطلب غير صالح");
    }

    const nextStatus = typeof body.status === "string" ? body.status : undefined;
    if (nextStatus && !ORDER_STATUSES.includes(nextStatus as (typeof ORDER_STATUSES)[number])) {
      return apiBadRequest("حالة الطلب غير صالحة");
    }
    const nextItems =
      Array.isArray(body.items) && body.items.length > 0 ? body.items : undefined;
    if (Array.isArray(body.items) && body.items.length === 0) {
      return apiBadRequest("يجب أن يحتوي الطلب على بند واحد على الأقل");
    }
    if (!nextStatus && !nextItems && body.adminNotes === undefined) {
      return apiBadRequest("لا توجد حقول للتحديث");
    }

    const transitioningToCancelled = nextStatus === "CANCELLED" && existing.status !== "CANCELLED";
    const leavingCreated =
      existing.status === "CREATED" &&
      !!nextStatus &&
      nextStatus !== "CREATED" &&
      nextStatus !== "CANCELLED";
    if (transitioningToCancelled && nextItems) {
      return apiBadRequest("لا يمكن تعديل أصناف الطلب مع إلغائه في نفس الطلب");
    }
    if (nextItems && existing.status === "CANCELLED") {
      return apiBadRequest("لا يمكن تعديل أصناف طلب ملغى");
    }

    const oldItemStockLines: StockLine[] = existing.items.map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
    }));
    let newItemStockLines: StockLine[] | undefined;

    const data: Prisma.OrderUpdateInput = {};
    if (nextStatus) data.status = nextStatus as OrderStatus;
    if (body.adminNotes !== undefined) {
      data.adminNotes = body.adminNotes === "" ? null : String(body.adminNotes).trim();
    }

    if (nextItems) {
      const normalized = new Map<string, number>();
      for (const raw of nextItems) {
        const variantId = typeof raw?.variantId === "string" ? raw.variantId.trim() : "";
        const quantity = typeof raw?.quantity === "number" ? Math.trunc(raw.quantity) : NaN;
        if (!variantId || !Number.isFinite(quantity) || quantity < 1) {
          return apiBadRequest("الكمية أو المتغير غير صالح");
        }
        normalized.set(variantId, (normalized.get(variantId) ?? 0) + quantity);
      }
      const lines = Array.from(normalized.entries()).map(([variantId, quantity]) => ({ variantId, quantity }));
      const variantIds = lines.map((l) => l.variantId);
      const variants = await prisma.variant.findMany({
        where: { id: { in: variantIds } },
        include: { product: { select: { name: true, slug: true, weightGrams: true } } },
      });
      if (variants.length !== variantIds.length) {
        return apiBadRequest("بعض المتغيرات غير موجودة");
      }
      const byId = new Map(variants.map((v) => [v.id, v]));

      let weightGrams = 0;
      const pricedLines: { variantId: string; quantity: number; unitPricePiastres: number }[] = [];
      for (const line of lines) {
        const variant = byId.get(line.variantId);
        if (!variant) return apiBadRequest("بعض المتغيرات غير موجودة");
        const w = variant.product.weightGrams;
        if (w == null || w < 0) {
          return apiBadRequest("لا يمكن إعادة حساب الشحن: وزن بعض المنتجات غير متوفر");
        }
        weightGrams += line.quantity * w;
        pricedLines.push({
          variantId: line.variantId,
          quantity: line.quantity,
          unitPricePiastres: variant.pricePiastres,
        });
      }

      const orderUser = await prisma.user.findUnique({
        where: { id: existing.userId },
        select: { seniorVerified: true },
      });
      const seniorPromoEnabled = await isSeniorPromoEnabled();
      const pricing = await computePricing({
        lines: pricedLines,
        couponCode: existing.couponCode ?? null,
        seniorVerified: orderUser?.seniorVerified ?? false,
        seniorPromoEnabled,
      });
      const address = existing.shippingAddress as { governorate?: string; city?: string | null; area?: string | null };
      if (!address?.governorate) {
        return apiBadRequest("لا يمكن حساب الشحن: عنوان الشحن غير صالح");
      }
      const shippingOption = getPhase1ShippingFee(
        { governorate: address.governorate, city: address.city ?? null, area: address.area ?? null },
        weightGrams
      );
      if (!shippingOption) {
        return apiBadRequest("لا يمكن حساب الشحن لهذا العنوان");
      }

      const beforeCod = pricing.totalPiastres + shippingOption.feePiastres;
      const codFeePercent = await getCodFeePercent();
      const codFee =
        existing.paymentMethod === "COD" ? computeCodFeePiastres(beforeCod, codFeePercent) : 0;
      const finalTotal = beforeCod + codFee;
      if (
        [
          pricing.subtotalPiastres,
          pricing.couponDiscountPiastres,
          pricing.seniorDiscountPiastres,
          shippingOption.feePiastres,
          shippingOption.carrierFeePiastres,
          codFee,
          finalTotal,
        ].some((n) => n < 0 || n > INT32_MAX)
      ) {
        return apiBadRequest("قيمة الطلب تتجاوز الحد المسموح");
      }

      data.subtotalPiastres = pricing.subtotalPiastres;
      data.discountPiastres = pricing.couponDiscountPiastres;
      data.seniorFreeValuePiastres = pricing.seniorDiscountPiastres;
      data.shippingProvider = PHASE1_SHIPPING_PROVIDER_DISPLAY;
      data.shippingPiastres = shippingOption.feePiastres;
      data.carrierShippingPiastres = shippingOption.carrierFeePiastres;
      data.codFeePiastres = codFee;
      data.totalPiastres = finalTotal;
      data.couponCode = pricing.appliedCouponCode ?? null;
      data.items = {
        deleteMany: {},
        create: lines.map((line) => {
          const variant = byId.get(line.variantId)!;
          const color = variant.colorName?.trim();
          const variantName = color ? `${variant.product.slug}-${variant.name}-${color}` : `${variant.product.slug}-${variant.name}`;
          return {
            variantId: line.variantId,
            productName: variant.product.name,
            variantName,
            sku: variant.sku,
            quantity: line.quantity,
            unitPricePiastres: variant.pricePiastres,
            totalPiastres: line.quantity * variant.pricePiastres,
          };
        }),
      };
      newItemStockLines = lines;
    }

    const itemEditChangesStock =
      Boolean(newItemStockLines) && !stockLinesEquivalent(oldItemStockLines, newItemStockLines!);

    async function applyLeavingCreatedStock(
      tx: Parameters<typeof commitPartnerReservation>[0],
      lines: StockLine[]
    ) {
      await commitPartnerReservation(tx, user.partnerId, lines, existing!.id);
      data.reservationExpiresAt = null;
      if (nextStatus === "CONFIRMED") {
        await logOrderConfirmed(tx, existing!.id);
      } else if (nextStatus) {
        await logOrderStatusChange(tx, existing!.id, "CREATED", nextStatus);
      }
      if (existing!.paymentMethod === "INSTAPAY_PREPAID") {
        await tx.paymentAttempt.updateMany({
          where: { orderId: existing!.id, status: "PENDING" },
          data: { status: "CAPTURED" },
        });
      }
    }

    if (transitioningToCancelled) {
      data.cancellationReason = "partner_agent";
      const order = await prisma.$transaction(
        async (tx) => {
          if (orderUsesPartnerReservationOnly(existing.status)) {
            await releasePartnerReservation(tx, user.partnerId, oldItemStockLines, existing.id);
          } else {
            await restorePartnerCommittedStock(tx, user.partnerId, oldItemStockLines, existing.id);
          }
          await logOrderCancelled(tx, existing.id, "partner_agent", existing.status);
          return tx.order.update({ where: { id }, data, include: orderInclude });
        },
        { maxWait: 15_000, timeout: 60_000 }
      );
      return apiSuccess(mapOrder(order));
    }

    if (itemEditChangesStock) {
      try {
        const linesAfterEdit = newItemStockLines!;
        const order = await prisma.$transaction(
          async (tx) => {
            await reconcilePartnerStockForAdminOrderItemEdit(
              tx,
              user.partnerId,
              existing.status,
              oldItemStockLines,
              linesAfterEdit,
              existing.id
            );
            if (leavingCreated) {
              await applyLeavingCreatedStock(tx, linesAfterEdit);
            }
            return tx.order.update({ where: { id }, data, include: orderInclude });
          },
          { maxWait: 15_000, timeout: 60_000 }
        );
        return apiSuccess(mapOrder(order));
      } catch (error) {
        if (error instanceof InsufficientPartnerStockError) {
          return apiBadRequest("كمية غير متوفرة في مخزون الشريك لتعديل الطلب بهذه الأصناف");
        }
        throw error;
      }
    }

    if (leavingCreated) {
      try {
        const order = await prisma.$transaction(
          async (tx) => {
            await applyLeavingCreatedStock(tx, oldItemStockLines);
            return tx.order.update({ where: { id }, data, include: orderInclude });
          },
          { maxWait: 15_000, timeout: 60_000 }
        );
        return apiSuccess(mapOrder(order));
      } catch (error) {
        if (error instanceof InsufficientPartnerStockError) {
          return apiBadRequest("كمية غير متوفرة في مخزون الشريك لتأكيد الطلب");
        }
        throw error;
      }
    }

    const order = await prisma.$transaction(async (tx) => {
      if (nextStatus && nextStatus !== existing.status) {
        await logOrderStatusChange(tx, existing.id, existing.status, nextStatus);
      }
      return tx.order.update({ where: { id }, data, include: orderInclude });
    });
    return apiSuccess(mapOrder(order));
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
