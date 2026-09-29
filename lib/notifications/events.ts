/**
 * Shared partner "order assigned" notification (backlog 10.38). Three code paths set an
 * order's `assignedPartnerId` — storefront/admin checkout (`lib/checkout/place-order.ts`),
 * the admin's manual/reassign flow (`lib/orders/assign-partner.ts`), and the rule-based
 * auto-router's first-time assignment (`lib/rerouting/assign.ts`) — and every one of them must
 * notify the newly-assigned partner exactly once, from inside the same transaction that made
 * the assignment. This module is the one place that title format and "no userId, no
 * notification" rule live, so the three call sites can't drift.
 *
 * Not called when `assignOrderToGovernorate` only records a `RoutedOrder` for an order that
 * already had an `assignedPartnerId` (place-order already notified in that same request) —
 * that branch lives in `assign.ts` and intentionally has no call here.
 */
import type { Prisma } from "@prisma/client";
import { notify } from "./notify";

type Tx = Omit<Prisma.TransactionClient, "$transaction">;

export type NotifyOrderAssignedInput = {
  orderId: string;
  partnerId: string;
  /** Short order id as already shown elsewhere in the UI, e.g. `orderId.slice(0, 8)`. */
  shortId: string;
  area: string;
  itemCount: number;
};

/** Resolves `partner.userId` and skips (no query, no throw) when the partner has none —
 * a `Partner` row created before a linked `User` account exists. */
export async function notifyOrderAssigned(tx: Tx, input: NotifyOrderAssignedInput): Promise<void> {
  const partner = await tx.partner.findUnique({
    where: { id: input.partnerId },
    select: { userId: true },
  });
  if (!partner?.userId) return;

  await notify(tx, {
    audience: { userId: partner.userId },
    kind: "order.assigned",
    title: `طلب جديد #${input.shortId} · ${input.area} · ${input.itemCount} قطع`,
    href: `/partner/orders/${input.orderId}`,
    entity: { type: "order", id: input.orderId },
  });
}
