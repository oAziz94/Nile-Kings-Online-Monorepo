/**
 * Partner order status transition — extracted, byte-equivalent, from the status-change
 * branches of `app/api/partner/orders/[id]/route.ts`'s PATCH handler (backlog 4.19,
 * `docs/redesign/03-backlog.md` Partner portal section: "extract the single-order status
 * transition ... into `lib/orders/partner-status-transition.ts` byte-equivalent in
 * behaviour"). Covers exactly the three status-only branches of that handler:
 *
 *   1. Transitioning to CANCELLED (from any non-cancelled status): releases the partner's
 *      reservation-only stock or restores previously committed stock, depending on the
 *      order's current status, then logs `logOrderCancelled`.
 *   2. Leaving CREATED for the first time (to anything except CREATED/CANCELLED): commits
 *      the partner's stock reservation, clears `reservationExpiresAt`, captures any
 *      `PENDING` InstaPay `PaymentAttempt` rows, and logs either `logOrderConfirmed` (when
 *      the target is CONFIRMED) or a generic `logOrderStatusChange`.
 *   3. Any other status change: a generic `logOrderStatusChange` entry.
 *
 * Deliberately NOT covered here (stays inline in the route): the item-edit branches
 * (`itemEditChangesStock`, and the items-present flavour of "leaving CREATED") — those
 * interleave stock reconciliation with the items PATCH payload and are not a pure status
 * transition. This function is safe to call once per order inside a loop (each call opens
 * its own `prisma.$transaction`), which is exactly what the bulk-status endpoint needs
 * ("one transaction per order so one insufficient-stock failure does not roll back the
 * others").
 */
import { Prisma, type OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { StockLine } from "@/lib/services/stock";
import {
  commitPartnerReservation,
  InsufficientPartnerStockError,
  orderUsesPartnerReservationOnly,
  releasePartnerReservation,
  restorePartnerCommittedStock,
} from "@/lib/inventory/partner-inventory";
import { logOrderCancelled, logOrderConfirmed, logOrderStatusChange } from "@/lib/audit/order-audit";
import { logAdminAction } from "@/lib/audit/admin-audit";
import type { SessionUser } from "@/lib/auth/session";

export const ORDER_STATUSES = [
  "CREATED",
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;

export const orderInclude = {
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
} as const;

export type PartnerOrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

/** Thrown for both of this module's 400s ("حالة الطلب غير صالحة" / the insufficient-stock
 * message) and its 404 ("الطلب غير موجود") — callers map `status` to the right HTTP response. */
export class PartnerOrderTransitionError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PartnerOrderTransitionError";
    this.status = status;
  }
}

/** Mirrors the route's `mapOrder`: flattens the variant's image onto each item, drops the raw variant. */
export function mapPartnerOrder(order: PartnerOrderRow) {
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      imageUrl: item.variant.imageUrl ?? item.variant.product.imageUrl ?? null,
      variant: undefined,
    })),
  };
}

/**
 * Locks the order row for the rest of the transaction and rejects the transition if another
 * request already moved it (two parallel "confirm" clicks must commit reserved stock once).
 * Exported so any other read-modify-write on `Order.status` (e.g. the customer's own cancel
 * endpoint, backlog 6.4) reuses the same row-lock rule instead of duplicating the raw query.
 */
export async function lockOrderAtStatus(tx: Prisma.TransactionClient, orderId: string, expectedStatus: OrderStatus) {
  const rows = await tx.$queryRaw<{ status: OrderStatus }[]>`SELECT "status" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
  const locked = rows[0];
  if (!locked) throw new PartnerOrderTransitionError("الطلب غير موجود", 404);
  if (locked.status !== expectedStatus) {
    throw new PartnerOrderTransitionError("تغيّرت حالة الطلب بالفعل — حدّث الصفحة", 409);
  }
}

/**
 * Releases the stock a cancelled order was holding — a reservation-only release when the order
 * was still CREATED, or a restore of previously committed stock otherwise. Shared by the
 * partner cancellation branch below and the customer-facing cancel endpoint
 * (`app/api/profile/orders/[id]/cancel/route.ts`, backlog 6.4) so the two paths never diverge.
 */
export async function releaseReservationForCancellation(
  tx: Prisma.TransactionClient,
  partnerId: string,
  items: StockLine[],
  orderId: string,
  priorStatus: OrderStatus,
  notes: string
): Promise<void> {
  if (orderUsesPartnerReservationOnly(priorStatus)) {
    await releasePartnerReservation(tx, partnerId, items, orderId, notes);
  } else {
    await restorePartnerCommittedStock(tx, partnerId, items, orderId, notes);
  }
}

export async function transitionPartnerOrderStatus(params: {
  partnerId: string;
  orderId: string;
  nextStatus?: string;
  /** Only ever set by the route's own PATCH handler when a caller sends `adminNotes`
   * alongside a status change (or notes alone, with no status/items) — see `route.ts`'s
   * original `data.adminNotes = body.adminNotes === "" ? null : String(body.adminNotes).trim()`.
   * The bulk-status endpoint never passes this. */
  adminNotes?: string | null;
  /** Backlog 9.7 (e) — the partner `SessionUser` making this change, so a real status change
   * mirrors into `AdminAuditLog` with `actorRole: "PARTNER"`. Both current callers
   * (`app/api/partner/orders/[id]/route.ts`, `app/api/partner/routed-orders/bulk-status/route.ts`)
   * always pass this — the single place order status transitions by partners are mirrored from. */
  actor?: SessionUser;
}): Promise<PartnerOrderRow> {
  const { partnerId, orderId, nextStatus, adminNotes, actor } = params;

  if (nextStatus !== undefined && !ORDER_STATUSES.includes(nextStatus as (typeof ORDER_STATUSES)[number])) {
    throw new PartnerOrderTransitionError("حالة الطلب غير صالحة");
  }

  const existing = await prisma.order.findFirst({
    where: { id: orderId, assignedPartnerId: partnerId },
    include: { items: true },
  });
  if (!existing) {
    throw new PartnerOrderTransitionError("الطلب غير موجود", 404);
  }

  const transitioningToCancelled = nextStatus === "CANCELLED" && existing.status !== "CANCELLED";
  const leavingCreated =
    existing.status === "CREATED" && !!nextStatus && nextStatus !== "CREATED" && nextStatus !== "CANCELLED";

  const oldItemStockLines: StockLine[] = existing.items.map((i) => ({
    variantId: i.variantId,
    quantity: i.quantity,
  }));

  const data: Prisma.OrderUpdateInput = {};
  if (nextStatus) data.status = nextStatus as OrderStatus;
  if (adminNotes !== undefined) {
    // null and "" both clear the note (PM fix 2026-09-12; `String(null)` used to store "null").
    data.adminNotes = adminNotes === null || adminNotes === "" ? null : String(adminNotes).trim() || null;
  }

  if (transitioningToCancelled) {
    data.cancellationReason = "partner_agent";
    const order = await prisma.$transaction(
      async (tx) => {
        await lockOrderAtStatus(tx, orderId, existing.status);
        await releaseReservationForCancellation(
          tx,
          partnerId,
          oldItemStockLines,
          existing.id,
          existing.status,
          "Partner order cancellation"
        );
        await logOrderCancelled(tx, existing.id, "partner_agent", existing.status);
        if (actor) {
          await logAdminAction(tx, {
            actor,
            action: "status_change",
            entityType: "order",
            entityId: existing.id,
            entityLabel: `#${existing.id.slice(-8)}`,
            before: { status: existing.status },
            after: { status: "CANCELLED" },
            ip: null,
          });
        }
        return tx.order.update({ where: { id: orderId }, data, include: orderInclude });
      },
      { maxWait: 15_000, timeout: 60_000 }
    );
    return order;
  }

  if (leavingCreated) {
    try {
      const order = await prisma.$transaction(
        async (tx) => {
          await lockOrderAtStatus(tx, orderId, existing.status);
          await commitPartnerReservation(tx, partnerId, oldItemStockLines, existing.id, "Partner order edit");
          data.reservationExpiresAt = null;
          if (nextStatus === "CONFIRMED") {
            await logOrderConfirmed(tx, existing.id);
          } else {
            await logOrderStatusChange(tx, existing.id, "CREATED", nextStatus!);
          }
          if (actor) {
            await logAdminAction(tx, {
              actor,
              action: "status_change",
              entityType: "order",
              entityId: existing.id,
              entityLabel: `#${existing.id.slice(-8)}`,
              before: { status: "CREATED" },
              after: { status: nextStatus },
              ip: null,
            });
          }
          if (existing.paymentMethod === "INSTAPAY_PREPAID") {
            await tx.paymentAttempt.updateMany({
              where: { orderId: existing.id, status: "PENDING" },
              data: { status: "CAPTURED" },
            });
          }
          return tx.order.update({ where: { id: orderId }, data, include: orderInclude });
        },
        { maxWait: 15_000, timeout: 60_000 }
      );
      return order;
    } catch (error) {
      if (error instanceof InsufficientPartnerStockError) {
        throw new PartnerOrderTransitionError("كمية غير متوفرة في مخزون الشريك لتأكيد الطلب");
      }
      throw error;
    }
  }

  const order = await prisma.$transaction(async (tx) => {
    if (nextStatus && nextStatus !== existing.status) {
      await lockOrderAtStatus(tx, orderId, existing.status);
      await logOrderStatusChange(tx, existing.id, existing.status, nextStatus);
      if (actor) {
        await logAdminAction(tx, {
          actor,
          action: "status_change",
          entityType: "order",
          entityId: existing.id,
          entityLabel: `#${existing.id.slice(-8)}`,
          before: { status: existing.status },
          after: { status: nextStatus },
          ip: null,
        });
      }
    }
    return tx.order.update({ where: { id: orderId }, data, include: orderInclude });
  });
  return order;
}
