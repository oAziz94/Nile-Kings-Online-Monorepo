import { requireCustomer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiConflict,
  apiInternal,
} from "@/lib/api/response";
import {
  lockOrderAtStatus,
  releaseReservationForCancellation,
  PartnerOrderTransitionError,
} from "@/lib/orders/partner-status-transition";
import type { StockLine } from "@/lib/services/stock";

/**
 * PATCH /api/profile/orders/[id]/cancel — customer self-cancel (backlog 6.4).
 * Only ever offered while the order is still CREATED (before a partner has confirmed it).
 * Row-locked exactly like the partner transition module (rule A3 / 04-decisions.md
 * "Order transitions lock the order row") — releasing the reservation through the same
 * `releaseReservationForCancellation` helper the partner cancellation path uses, rather than
 * duplicating the release/restore branching.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  const { id } = await params;

  const existing = await prisma.order.findFirst({
    where: { id, userId: user.userId },
    include: { items: { select: { variantId: true, quantity: true } } },
  });
  if (!existing) {
    return apiNotFound("الطلب غير موجود");
  }
  if (existing.status !== "CREATED") {
    return apiConflict("لا يمكن إلغاء هذا الطلب في حالته الحالية");
  }

  const itemLines: StockLine[] = existing.items.map((i) => ({
    variantId: i.variantId,
    quantity: i.quantity,
  }));

  try {
    const order = await prisma.$transaction(
      async (tx) => {
        await lockOrderAtStatus(tx, id, "CREATED");
        if (existing.assignedPartnerId) {
          await releaseReservationForCancellation(
            tx,
            existing.assignedPartnerId,
            itemLines,
            id,
            "CREATED",
            "Customer order cancellation"
          );
        }
        await tx.orderAuditLog.create({
          data: {
            orderId: id,
            event: "cancelled",
            statusFrom: "CREATED",
            statusTo: "CANCELLED",
            details: { cancelledBy: "customer" },
          },
        });
        return tx.order.update({
          where: { id },
          data: { status: "CANCELLED", cancellationReason: "customer" },
        });
      },
      { maxWait: 15_000, timeout: 60_000 }
    );
    return apiSuccess({ id: order.id, status: order.status });
  } catch (error) {
    if (error instanceof PartnerOrderTransitionError) {
      if (error.status === 409) return apiConflict(error.message);
      if (error.status === 404) return apiNotFound(error.message);
    }
    console.error("PATCH /api/profile/orders/[id]/cancel", error);
    return apiInternal("تعذّر إلغاء الطلب");
  }
}
