/**
 * Pure logic for اليوم (backlog 5.2, `05-partner-portal-v2.md` §4.2) — kept Prisma-free so
 * it is directly unit-testable (`lib/partner/today.test.ts` per the task's "unit tests for
 * the overdue/capacity/period logic"). `app/api/partner/today/route.ts` is the thin Prisma
 * wrapper that feeds these functions real rows.
 *
 * One exception: `findOverdueAssignedOrders` below (backlog 9.2, B3) — the "which assigned
 * orders are overdue" query, lifted verbatim out of the partner today route so the admin's
 * network-wide "متأخرة عند الشريك" queue and the partner's own overdue group share one
 * query instead of two implementations of the same rule. It takes an optional partner scope
 * (`{}` = every partner in the network) and evaluates each order against *its own assigned
 * partner's* `confirmSlaHours`/`shipSlaHours` — never a single SLA for every order.
 */

import { prisma } from "@/lib/db";
import { computeOrderSla, SLA_ELIGIBLE_STATUSES, type PartnerSlaHours } from "@/lib/orders/order-sla";

export type DateRange = { start: Date; end: Date };

/**
 * Egypt's business week starts Saturday (`Partner.workingDays`'s own default order:
 * SAT..FRI). "This week" = [most recent Saturday 00:00 local, now]; "last week" = the
 * 7 days immediately before that, same length.
 */
export function resolveWeekRanges(now: Date): { thisWeek: DateRange; lastWeek: DateRange } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const offsetFromSaturday = (start.getDay() - 6 + 7) % 7; // Sat(6) -> 0, Sun(0) -> 1, ... Fri(5) -> 6
  start.setDate(start.getDate() - offsetFromSaturday);

  const lastWeekStart = new Date(start);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  return {
    thisWeek: { start, end: now },
    lastWeek: { start: lastWeekStart, end: start },
  };
}

export type OverdueSla = PartnerSlaHours;
export type OverdueStatus = (typeof SLA_ELIGIBLE_STATUSES)[number];
export { SLA_ELIGIBLE_STATUSES };

/**
 * The moment an order entered its current status: the latest `OrderAuditLog` row's
 * `createdAt` (event in `status_change`/`confirmed`), or `updatedAt` when there is none —
 * "orders with no audit row fall back to `updatedAt`".
 */
export function resolveStatusEnteredAt(row: { updatedAt: Date; latestStatusLogAt: Date | null }): Date {
  return row.latestStatusLogAt ?? row.updatedAt;
}

/**
 * Overdue rule (replaces the hard-coded 24h everywhere) — one source, `lib/orders/order-sla.ts`
 * (5.7 unification): CREATED is timed against `confirmSlaHours`; CONFIRMED / PROCESSING /
 * READY_TO_SHIP against `shipSlaHours` ("مهلة الشحن بعد التأكيد"); terminal statuses never.
 */
export function isOrderOverdue(
  row: { status: string; updatedAt: Date; latestStatusLogAt: Date | null },
  sla: OverdueSla,
  now: Date
): boolean {
  const result = computeOrderSla({ status: row.status, since: resolveStatusEnteredAt(row), partner: sla, now });
  return result.applicable && result.overdue;
}

/** The address line every اليوم order row shows ("مدينة/منطقة · محافظة"). */
export function addressLine(shippingAddress: unknown): string {
  const a = (shippingAddress ?? {}) as { governorate?: string; city?: string | null; area?: string | null };
  return [a.city || a.area, a.governorate].filter(Boolean).join(" · ");
}

/** Latest `status_change`/`confirmed` audit row per order id (empty map entries fall back to
 * `updatedAt`, per `resolveStatusEnteredAt`'s own rule). Plain Prisma, no raw SQL. */
async function latestStatusAuditAtByOrderId(orderIds: string[]): Promise<Map<string, Date>> {
  if (orderIds.length === 0) return new Map();
  const rows = await prisma.orderAuditLog.findMany({
    where: { orderId: { in: orderIds }, event: { in: ["status_change", "confirmed"] } },
    orderBy: { createdAt: "desc" },
    distinct: ["orderId"],
    select: { orderId: true, createdAt: true },
  });
  return new Map(rows.map((r) => [r.orderId, r.createdAt]));
}

export type OverdueAssignedOrderRow = {
  id: string;
  status: OverdueStatus;
  totalPiastres: number;
  enteredAt: Date;
  partnerId: string;
  partnerName: string;
  customerName: string;
  addressLine: string;
  /** Whole hours past the SLA deadline, ≥ 1 — the admin queue's "تجاوز المهلة بـ N ساعة". */
  overdueHours: number;
};

/**
 * Every assigned order currently overdue against SLA_ELIGIBLE_STATUSES, oldest-overdue
 * first — `scope.partnerId` narrows to one partner (the partner today route's own use);
 * omitted, it is every partner in the network (backlog 9.2's "متأخرة عند الشريك" queue).
 * Each order is judged against *its assigned partner's own* `confirmSlaHours`/
 * `shipSlaHours`, never a single network-wide SLA.
 */
export async function findOverdueAssignedOrders(
  scope: { partnerId?: string } = {}
): Promise<OverdueAssignedOrderRow[]> {
  const orders = await prisma.order.findMany({
    where: {
      assignedPartnerId: scope.partnerId ? scope.partnerId : { not: null },
      status: { in: [...SLA_ELIGIBLE_STATUSES] },
    },
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      status: true,
      totalPiastres: true,
      updatedAt: true,
      shippingAddress: true,
      assignedPartnerId: true,
      user: { select: { name: true, phone: true } },
      assignedPartner: { select: { name: true, confirmSlaHours: true, shipSlaHours: true } },
    },
  });
  if (orders.length === 0) return [];

  const auditByOrderId = await latestStatusAuditAtByOrderId(orders.map((o) => o.id));
  const now = new Date();
  const result: OverdueAssignedOrderRow[] = [];
  for (const o of orders) {
    if (!o.assignedPartner || !o.assignedPartnerId) continue;
    const latestStatusLogAt = auditByOrderId.get(o.id) ?? null;
    const sla: PartnerSlaHours = {
      confirmSlaHours: o.assignedPartner.confirmSlaHours,
      shipSlaHours: o.assignedPartner.shipSlaHours,
    };
    const enteredAt = resolveStatusEnteredAt({ updatedAt: o.updatedAt, latestStatusLogAt });
    const slaResult = computeOrderSla({ status: o.status, since: enteredAt, partner: sla, now });
    if (!slaResult.applicable || !slaResult.overdue) continue;
    result.push({
      id: o.id,
      status: o.status as OverdueStatus,
      totalPiastres: o.totalPiastres,
      enteredAt,
      partnerId: o.assignedPartnerId,
      partnerName: o.assignedPartner.name,
      customerName: o.user.name?.trim() || o.user.phone,
      addressLine: addressLine(o.shippingAddress),
      overdueHours: Math.max(1, Math.round(-slaResult.remainingHours)),
    });
  }
  result.sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
  return result;
}

export type CapacityMeter = { used: number; capacity: number | null; remaining: number | null };

/** `dailyOrderCapacity` vs orders confirmed/processing today; null capacity hides the meter. */
export function buildCapacityMeter(capacity: number | null, used: number): CapacityMeter {
  return { used, capacity, remaining: capacity === null ? null : Math.max(0, capacity - used) };
}

export type RevenueBucketLike = {
  period: string; // "YYYY-MM-DD"
  netMerchandisePiastres: number;
  orderCount: number;
};

export type TrendPoint = { date: string; revenuePiastres: number; orderCount: number };

/**
 * `getRevenueOverTime` only returns days that had at least one order — the trend chart
 * needs a continuous `days`-point series ending at `endDate` (inclusive), zero-filled for
 * any day with no orders.
 */
export function buildTrendSeries(buckets: RevenueBucketLike[], days: number, endDate: Date): TrendPoint[] {
  const byDate = new Map(buckets.map((b) => [b.period, b]));
  // UTC-day arithmetic throughout — matches `getRevenueOverTime`'s own bucket keys
  // (`d.toISOString().slice(0, 10)` on the order's `createdAt` instant), and keeps this
  // function's day boundaries independent of the server's local timezone.
  const endUtcMidnight = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  const dayMs = 24 * 60 * 60 * 1000;

  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(endUtcMidnight - i * dayMs).toISOString().slice(0, 10);
    const bucket = byDate.get(key);
    points.push({
      date: key,
      revenuePiastres: bucket?.netMerchandisePiastres ?? 0,
      orderCount: bucket?.orderCount ?? 0,
    });
  }
  return points;
}
