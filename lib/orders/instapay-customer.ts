/**
 * Customer-side actions on an InstaPay prepaid order that is still CREATED (backlog 10.50):
 * "أتممت التحويل" (record the claim) and "إلغاء الطلب" (release the reservation).
 *
 * The order already exists, with stock reserved, before the QR is shown — so a customer can never
 * pay for a cart we cannot fulfil. Both actions are guarded identically: the order belongs to the
 * session user, is INSTAPAY_PREPAID, is CREATED. Any other order of the user's, or an order that
 * is not theirs, is indistinguishable (404 for foreign/unknown ids, 409 for wrong state).
 */
import { prisma } from "@/lib/db";
import { lockOrderAtStatus, PartnerOrderTransitionError } from "@/lib/orders/partner-status-transition";
import { orderUsesPartnerReservationOnly, releasePartnerReservation } from "@/lib/inventory/partner-inventory";
import { logOrderCancelled } from "@/lib/audit/order-audit";

export type InstaPayActionResult<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; status: 404 | 409; message: string };

const NOT_FOUND = { ok: false, status: 404, message: "الطلب غير موجود" } as const;
const WRONG_STATE = {
  ok: false,
  status: 409,
  message: "لا يمكن تنفيذ هذا الإجراء على الطلب في حالته الحالية",
} as const;

function claimedAtOf(metadata: unknown): string | null {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const v = (metadata as Record<string, unknown>).customerClaimedAt;
    if (typeof v === "string") return v;
  }
  return null;
}

/** Sets `PaymentAttempt.metadata.customerClaimedAt` on the order's PENDING attempt. Idempotent. */
export async function claimInstaPayTransfer(input: {
  orderId: string;
  userId: string;
}): Promise<InstaPayActionResult<{ customerClaimedAt: string }>> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, userId: input.userId },
    select: { id: true, status: true, paymentMethod: true },
  });
  if (!order) return NOT_FOUND;
  if (order.paymentMethod !== "INSTAPAY_PREPAID" || order.status !== "CREATED") return WRONG_STATE;

  const attempt = await prisma.paymentAttempt.findFirst({
    where: { orderId: order.id, provider: "INSTAPAY_PREPAID", status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, metadata: true },
  });
  if (!attempt) return WRONG_STATE;

  const existing = claimedAtOf(attempt.metadata);
  if (existing) return { ok: true, customerClaimedAt: existing };

  const customerClaimedAt = new Date().toISOString();
  const base =
    attempt.metadata && typeof attempt.metadata === "object" && !Array.isArray(attempt.metadata)
      ? (attempt.metadata as Record<string, unknown>)
      : {};
  await prisma.paymentAttempt.update({
    where: { id: attempt.id },
    data: { metadata: { ...base, customerClaimedAt } },
  });
  return { ok: true, customerClaimedAt };
}

/** Customer cancels their own CREATED InstaPay order: releases the reservation, audits, flags the reason. */
export async function cancelInstaPayOrderByCustomer(input: {
  orderId: string;
  userId: string;
}): Promise<InstaPayActionResult> {
  const order = await prisma.order.findFirst({
    where: { id: input.orderId, userId: input.userId },
    select: {
      id: true,
      status: true,
      paymentMethod: true,
      assignedPartnerId: true,
      items: { select: { variantId: true, quantity: true } },
    },
  });
  if (!order) return NOT_FOUND;
  if (order.paymentMethod !== "INSTAPAY_PREPAID" || order.status !== "CREATED") return WRONG_STATE;

  try {
    await prisma.$transaction(
      async (tx) => {
        // Row lock: an admin/partner confirming the order at the same moment wins or loses cleanly.
        await lockOrderAtStatus(tx, order.id, "CREATED");
        const pending = await tx.paymentAttempt.findFirst({
          where: { orderId: order.id, provider: "INSTAPAY_PREPAID", status: "PENDING" },
          select: { id: true },
        });
        if (!pending) throw new PartnerOrderTransitionError("لا يمكن إلغاء الطلب بعد تسجيل الدفع", 409);
        if (order.assignedPartnerId && orderUsesPartnerReservationOnly(order.status)) {
          await releasePartnerReservation(
            tx,
            order.assignedPartnerId,
            order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
            order.id,
            "Customer cancelled InstaPay order"
          );
        }
        await logOrderCancelled(tx, order.id, "customer", "CREATED");
        await tx.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED", cancellationReason: "customer", reservationExpiresAt: null },
        });
      },
      { maxWait: 15_000, timeout: 60_000 }
    );
  } catch (e) {
    if (e instanceof PartnerOrderTransitionError) {
      return e.status === 404 ? NOT_FOUND : WRONG_STATE;
    }
    throw e;
  }
  return { ok: true };
}
