/**
 * Order SLA countdown / overdue math (backlog 5.3, `05-partner-portal-v2.md` §4.3 +
 * 5.2's "متأخرة" rule: "latest `OrderAuditLog` status row older than the partner's
 * `confirmSlaHours`/`shipSlaHours` — replaces the hard-coded 24h everywhere"). Pure, no
 * Prisma — callers resolve `since` (the latest `OrderAuditLog.createdAt` for the order,
 * or `Order.createdAt` when no audit rows exist yet) and the partner's two SLA fields.
 *
 * SLA mapping: `CREATED` is timed against `confirmSlaHours` (deadline to confirm);
 * `CONFIRMED`/`PROCESSING`/`READY_TO_SHIP` are timed against `shipSlaHours` (deadline to
 * ship). `SHIPPED`/`DELIVERED`/`CANCELLED` are terminal for SLA purposes — never overdue.
 */

export type PartnerSlaHours = { confirmSlaHours: number; shipSlaHours: number };

/** Statuses an order can be overdue in — used to scope the `overdue=1` list filter. */
export const SLA_ELIGIBLE_STATUSES = ["CREATED", "CONFIRMED", "PROCESSING", "READY_TO_SHIP"] as const;

export function slaHoursForOrderStatus(status: string, partner: PartnerSlaHours): number | null {
  if (status === "CREATED") return partner.confirmSlaHours;
  if (status === "CONFIRMED" || status === "PROCESSING" || status === "READY_TO_SHIP") {
    return partner.shipSlaHours;
  }
  return null;
}

export type OrderSlaResult =
  | { applicable: false }
  | {
      applicable: true;
      hours: number;
      since: Date;
      deadline: Date;
      overdue: boolean;
      /** Negative once past the deadline. */
      remainingHours: number;
    };

export function computeOrderSla(params: {
  status: string;
  since: Date;
  partner: PartnerSlaHours;
  now?: Date;
}): OrderSlaResult {
  const hours = slaHoursForOrderStatus(params.status, params.partner);
  if (hours == null) return { applicable: false };
  const now = params.now ?? new Date();
  const deadline = new Date(params.since.getTime() + hours * 3_600_000);
  const remainingHours = (deadline.getTime() - now.getTime()) / 3_600_000;
  return { applicable: true, hours, since: params.since, deadline, overdue: remainingHours < 0, remainingHours };
}
