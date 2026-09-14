/**
 * One assignment function for the admin's order pipeline (backlog 9.3 d,
 * `docs/redesign/03-backlog.md` "9.3 — الطلبات"): assign an unassigned order to a partner,
 * or reassign an already-assigned one, moving the partner stock reservation
 * (`reassignReservedPartnerStock`/`reservePartnerStockForOrder`, rule B3 — the same
 * inventory functions the auto-router and the old routed-orders reassign route used, never
 * a re-implementation) and writing both audit trails (`OrderAuditLog` event
 * `assigned`/`reassigned`, and `AdminAuditLog` per rule B1).
 *
 * Used by `POST /api/admin/orders/[id]/assign` and the orders list's bulk-assign dialog.
 */
import type { Prisma } from "@prisma/client";
import type { SessionUser } from "@/lib/auth/session";
import {
  commitPartnerReservation,
  InsufficientPartnerStockError,
  orderUsesPartnerReservationOnly,
  reassignReservedPartnerStock,
  reservePartnerStockForOrder,
  type PrismaTx,
} from "@/lib/inventory/partner-inventory";
import { logOrderPartnerAssigned } from "@/lib/audit/order-audit";
import { logAdminAction } from "@/lib/audit/admin-audit";
import type { StockLine } from "@/lib/services/stock";

export class AssignPartnerError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "AssignPartnerError";
    this.status = status;
  }
}

const TERMINAL_STATUSES = new Set(["DELIVERED", "CANCELLED"]);

/** Pure decision — no order can be (re)assigned once delivered or cancelled; otherwise the
 * presence of an existing `RoutedOrder` decides "assign" vs "reassign". Kept pure/exported
 * so it is unit-testable without a mocked Prisma transaction. */
export type AssignDecision =
  | { kind: "refuse"; reason: string }
  | { kind: "assign" }
  | { kind: "reassign" };

export function decideAssignmentAction(status: string, hasRoutedOrder: boolean): AssignDecision {
  if (TERMINAL_STATUSES.has(status)) {
    return { kind: "refuse", reason: "لا يمكن إسناد طلب مُسلَّم أو ملغي" };
  }
  return hasRoutedOrder ? { kind: "reassign" } : { kind: "assign" };
}

export type AssignOrderToPartnerInput = {
  orderId: string;
  partnerId: string;
  actor: SessionUser;
  notes?: string | null;
  ip?: string | null;
};

export type AssignOrderToPartnerResult = {
  orderId: string;
  partnerId: string;
  oldPartnerId: string | null;
  routedOrderId: string;
};

export async function assignOrderToPartner(
  tx: Prisma.TransactionClient,
  input: AssignOrderToPartnerInput
): Promise<AssignOrderToPartnerResult> {
  const { orderId, partnerId, actor, notes, ip } = input;

  // Row lock for the rest of the transaction — two concurrent assigns of the same order
  // must not both reserve stock against a partner the other one just moved away from.
  await tx.$executeRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;

  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: { select: { variantId: true, quantity: true } }, routedOrder: true },
  });
  if (!order) throw new AssignPartnerError("الطلب غير موجود", 404);

  const decision = decideAssignmentAction(order.status, Boolean(order.routedOrder));
  if (decision.kind === "refuse") throw new AssignPartnerError(decision.reason, 409);

  const partner = await tx.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, governorate: true, isActive: true },
  });
  if (!partner) throw new AssignPartnerError("الشريك غير موجود", 400);

  const lines: StockLine[] = order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
  const oldPartnerId = order.assignedPartnerId;
  let routedOrderId: string;

  try {
    if (decision.kind === "reassign" && order.routedOrder) {
      await reassignReservedPartnerStock({
        tx: tx as unknown as PrismaTx,
        routedOrderId: order.routedOrder.id,
        oldPartnerId,
        newPartnerId: partnerId,
        orderId,
        orderStatus: order.status,
        lines,
        notes: notes ?? "Admin reassignment",
      });
      const mergedNotes = notes
        ? order.routedOrder.notes
          ? `${order.routedOrder.notes}\n${notes}`
          : notes
        : order.routedOrder.notes;
      await tx.routedOrder.update({
        where: { id: order.routedOrder.id },
        data: {
          partnerId,
          assignmentMode: "MANUAL",
          status: "ASSIGNED",
          notifiedAt: null,
          notificationError: null,
          notes: mergedNotes,
        },
      });
      routedOrderId = order.routedOrder.id;
    } else {
      await reservePartnerStockForOrder(tx as unknown as PrismaTx, partnerId, lines, orderId, notes ?? "Admin assignment");
      // A first-time assign onto an order that has already left CREATED (e.g. CONFIRMED)
      // must commit the reservation immediately, exactly like `reassignReservedPartnerStock`
      // decides for its own new-partner side via the same `orderUsesPartnerReservationOnly`
      // check — a CONFIRMED order sitting at "reserved only" would double-count against the
      // partner's sellable stock and never settle to "committed" on its own.
      if (!orderUsesPartnerReservationOnly(order.status)) {
        await commitPartnerReservation(tx as unknown as PrismaTx, partnerId, lines, orderId, notes ?? "Admin assignment");
      }
      const created = await tx.routedOrder.create({
        data: {
          orderId,
          governorate: partner.governorate,
          partnerId,
          assignmentMode: "MANUAL",
          status: "ASSIGNED",
          notes: notes ?? null,
        },
        select: { id: true },
      });
      routedOrderId = created.id;
    }
  } catch (error) {
    if (error instanceof InsufficientPartnerStockError) throw error;
    throw error;
  }

  await tx.order.update({
    where: { id: orderId },
    data: { assignedPartnerId: partnerId, shippingOriginGovernorate: partner.governorate },
  });

  await logOrderPartnerAssigned(tx, orderId, oldPartnerId, partnerId);
  await logAdminAction(tx, {
    actor,
    action: decision.kind === "reassign" ? "reassign" : "assign",
    entityType: "order",
    entityId: orderId,
    entityLabel: `#${orderId.slice(-8)}`,
    before: { partnerId: oldPartnerId },
    after: { partnerId },
    reason: notes ?? null,
    ip: ip ?? null,
  });

  return { orderId, partnerId, oldPartnerId, routedOrderId };
}
