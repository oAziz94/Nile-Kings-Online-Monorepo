import { NextRequest } from "next/server";
import { Prisma, type OrderStatus } from "@prisma/client";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import {
  commitPartnerReservation,
  InsufficientPartnerStockError,
  releasePartnerReservation,
  restorePartnerCommittedStock,
  orderUsesPartnerReservationOnly,
} from "@/lib/inventory/partner-inventory";
import { logOrderCancelled, logOrderConfirmed, logOrderStatusChange } from "@/lib/audit/order-audit";

const ORDER_STATUSES = ["CREATED", "CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "CANCELLED"] as const;

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

    let body: { status?: string; adminNotes?: string | null };
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("جسم الطلب غير صالح");
    }

    const data: Prisma.OrderUpdateInput = {};
    const nextStatus = typeof body.status === "string" ? body.status : undefined;
    if (nextStatus && !ORDER_STATUSES.includes(nextStatus as (typeof ORDER_STATUSES)[number])) {
      return apiBadRequest("حالة الطلب غير صالحة");
    }
    if (nextStatus) data.status = nextStatus as OrderStatus;
    if (body.adminNotes !== undefined) {
      data.adminNotes = body.adminNotes === "" ? null : String(body.adminNotes).trim();
    }
    if (!nextStatus && body.adminNotes === undefined) return apiBadRequest("لا توجد حقول للتحديث");

    const lines = existing.items.map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    }));
    const transitioningToCancelled = nextStatus === "CANCELLED" && existing.status !== "CANCELLED";
    const leavingCreated =
      existing.status === "CREATED" &&
      !!nextStatus &&
      nextStatus !== "CREATED" &&
      nextStatus !== "CANCELLED";

    if (transitioningToCancelled) {
      data.cancellationReason = "partner_agent";
      const order = await prisma.$transaction(
        async (tx) => {
          if (orderUsesPartnerReservationOnly(existing.status)) {
            await releasePartnerReservation(tx, user.partnerId, lines, existing.id);
          } else {
            await restorePartnerCommittedStock(tx, user.partnerId, lines, existing.id);
          }
          await logOrderCancelled(tx, existing.id, "partner_agent", existing.status);
          return tx.order.update({ where: { id }, data, include: orderInclude });
        },
        { maxWait: 15_000, timeout: 60_000 }
      );
      return apiSuccess(mapOrder(order));
    }

    if (leavingCreated) {
      try {
        const order = await prisma.$transaction(
          async (tx) => {
            await commitPartnerReservation(tx, user.partnerId, lines, existing.id);
            data.reservationExpiresAt = null;
            if (nextStatus === "CONFIRMED") {
              await logOrderConfirmed(tx, existing.id);
            } else {
              await logOrderStatusChange(tx, existing.id, "CREATED", nextStatus);
            }
            if (existing.paymentMethod === "INSTAPAY_PREPAID") {
              await tx.paymentAttempt.updateMany({
                where: { orderId: existing.id, status: "PENDING" },
                data: { status: "CAPTURED" },
              });
            }
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
