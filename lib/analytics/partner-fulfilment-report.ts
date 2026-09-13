/**
 * Fulfilment report (backlog 5.6b) — `GET /api/partner/reports/fulfilment`. Question: "how
 * fast and how reliably do I fulfil?" Every order in the selected period (scoped by
 * `createdAt`, like the sales report's `orders`/`cancellationRate` headline — the whole
 * funnel, not just delivered orders) contributes to the counts; timing medians only use
 * orders that actually reached the relevant status, since a still-CREATED order has no
 * "hours to confirm" yet.
 *
 * Pure math lives in `computeOrderTimings` (below) so the medians are directly unit-
 * testable without a database — `lib/analytics/partner-fulfilment-report.test.ts`.
 */
import { prisma } from "@/lib/db";
import { isOrderOverdue, type OverdueStatus } from "@/lib/partner/today";
import {
  attachPreviousAndDelta,
  computeDelta,
  formatComparisonLabel,
  median,
  periodToDateRange,
  resolvePeriod,
  type Delta,
  type PartnerReportResponse,
  type ReportAction,
  type ReportBreakdownPage,
  type ReportHeadline,
  type SalesReportPreset,
} from "./partner-reports";
import { formatDateEn } from "@/lib/format-en-numbers";

export type FulfilmentOrderInput = {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  status: string;
  cancellationReason: string | null;
};

export type FulfilmentAuditRow = { orderId: string; statusTo: string | null; createdAt: Date };

export type OrderTiming = {
  orderId: string;
  hoursToConfirm: number | null;
  hoursToShip: number | null;
  /** `false` when the order has zero `OrderAuditLog` rows at all — assigned before the log
   * existed; excluded from both timing medians and counted in the "بدون توقيت" footnote. */
  hasAuditTrail: boolean;
  latestStatusLogAt: Date | null;
};

/**
 * Per-order timing derived from its audit trail: hours to confirm = first `CONFIRMED` row's
 * `createdAt` minus the order's own `createdAt`; hours to ship = first `SHIPPED` row minus
 * the first `CONFIRMED` row (an order confirmed-and-shipped in one jump with no `CONFIRMED`
 * row — should not happen given `logOrderConfirmed`'s own writes — reports `null` for ship
 * time rather than guessing).
 */
export function computeOrderTimings(
  orders: FulfilmentOrderInput[],
  auditRows: FulfilmentAuditRow[]
): OrderTiming[] {
  const rowsByOrder = new Map<string, FulfilmentAuditRow[]>();
  for (const row of auditRows) {
    const list = rowsByOrder.get(row.orderId) ?? [];
    list.push(row);
    rowsByOrder.set(row.orderId, list);
  }
  return orders.map((order) => {
    const rows = (rowsByOrder.get(order.id) ?? [])
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const confirmedRow = rows.find((r) => r.statusTo === "CONFIRMED");
    const shippedRow = rows.find((r) => r.statusTo === "SHIPPED");
    const hoursToConfirm = confirmedRow
      ? (confirmedRow.createdAt.getTime() - order.createdAt.getTime()) / 3_600_000
      : null;
    const hoursToShip =
      confirmedRow && shippedRow
        ? (shippedRow.createdAt.getTime() - confirmedRow.createdAt.getTime()) / 3_600_000
        : null;
    return {
      orderId: order.id,
      hoursToConfirm,
      hoursToShip,
      hasAuditTrail: rows.length > 0,
      latestStatusLogAt: rows.length > 0 ? rows[rows.length - 1].createdAt : null,
    };
  });
}

export type FulfilmentStats = {
  medianHoursToConfirm: number | null;
  medianHoursToShip: number | null;
  overdueRate: number;
  cancellationRate: number;
  deliveredRate: number;
  noAuditCount: number;
  totalOrders: number;
};

/** Every headline number for one period, pure (no Prisma) — the other half of the unit tests. */
export function computeFulfilmentStats(
  orders: FulfilmentOrderInput[],
  timings: OrderTiming[],
  sla: { confirmSlaHours: number; shipSlaHours: number },
  now: Date
): FulfilmentStats {
  const timingByOrder = new Map(timings.map((t) => [t.orderId, t]));
  const confirmHours = timings.map((t) => t.hoursToConfirm).filter((v): v is number => v !== null);
  const shipHours = timings.map((t) => t.hoursToShip).filter((v): v is number => v !== null);

  const openStatuses: OverdueStatus[] = ["CREATED", "CONFIRMED", "PROCESSING", "READY_TO_SHIP"];
  const openOrders = orders.filter((o) => openStatuses.includes(o.status as OverdueStatus));
  const overdueCount = openOrders.filter((o) => {
    const timing = timingByOrder.get(o.id);
    return isOrderOverdue(
      { status: o.status as OverdueStatus, updatedAt: o.updatedAt, latestStatusLogAt: timing?.latestStatusLogAt ?? null },
      sla,
      now
    );
  }).length;

  const cancelledCount = orders.filter((o) => o.status === "CANCELLED").length;
  const deliveredCount = orders.filter((o) => o.status === "DELIVERED").length;

  return {
    medianHoursToConfirm: median(confirmHours),
    medianHoursToShip: median(shipHours),
    overdueRate: openOrders.length > 0 ? (overdueCount / openOrders.length) * 100 : 0,
    cancellationRate: orders.length > 0 ? (cancelledCount / orders.length) * 100 : 0,
    deliveredRate: orders.length > 0 ? (deliveredCount / orders.length) * 100 : 0,
    noAuditCount: timings.filter((t) => !t.hasAuditTrail).length,
    totalOrders: orders.length,
  };
}

export type SlowestOrderRow = {
  orderId: string;
  createdAt: string;
  status: string;
  hoursToConfirm: number | null;
  hoursToShip: number | null;
};

export type CancellationReasonRow = {
  key: string;
  label: string;
  count: number;
  /** 7.4 — previous-period count of the same reason, over `period.previous`. */
  previousCount: number;
  countDelta: Delta;
};

export type FulfilmentReportBreakdowns = {
  slowest: ReportBreakdownPage<SlowestOrderRow>;
  cancellationReason: ReportBreakdownPage<CancellationReasonRow>;
};

export type FulfilmentReportResponse = PartnerReportResponse<FulfilmentReportBreakdowns> & {
  noAuditFootnote: string | null;
};

const PAGE_SIZE = 25;

async function loadOrders(partnerId: string, range: { from: Date; to: Date }): Promise<FulfilmentOrderInput[]> {
  return prisma.order.findMany({
    where: { assignedPartnerId: partnerId, createdAt: { gte: range.from, lte: range.to } },
    select: { id: true, createdAt: true, updatedAt: true, status: true, cancellationReason: true },
  });
}

async function loadAuditRows(orderIds: string[]): Promise<FulfilmentAuditRow[]> {
  if (orderIds.length === 0) return [];
  const rows = await prisma.orderAuditLog.findMany({
    where: { orderId: { in: orderIds } },
    select: { orderId: true, statusTo: true, createdAt: true },
  });
  return rows;
}

export async function getPartnerFulfilmentReport(
  partnerId: string,
  input: { preset: SalesReportPreset; from?: string; to?: string; page?: number }
): Promise<FulfilmentReportResponse> {
  const period = resolvePeriod(input);
  const page = Math.max(1, input.page ?? 1);
  const now = new Date();

  const [partner, currentOrders, previousOrders] = await Promise.all([
    prisma.partner.findUniqueOrThrow({ where: { id: partnerId }, select: { confirmSlaHours: true, shipSlaHours: true } }),
    loadOrders(partnerId, periodToDateRange(period.current)),
    loadOrders(partnerId, periodToDateRange(period.previous)),
  ]);

  const [currentAuditRows, previousAuditRows] = await Promise.all([
    loadAuditRows(currentOrders.map((o) => o.id)),
    loadAuditRows(previousOrders.map((o) => o.id)),
  ]);

  const currentTimings = computeOrderTimings(currentOrders, currentAuditRows);
  const previousTimings = computeOrderTimings(previousOrders, previousAuditRows);
  const sla = { confirmSlaHours: partner.confirmSlaHours, shipSlaHours: partner.shipSlaHours };
  const current = computeFulfilmentStats(currentOrders, currentTimings, sla, now);
  const previous = computeFulfilmentStats(previousOrders, previousTimings, sla, now);

  const headline: ReportHeadline[] = [
    {
      key: "medianHoursToConfirm",
      label: "متوسط الوقت للتأكيد",
      value: current.medianHoursToConfirm ?? 0,
      previous: previous.medianHoursToConfirm ?? 0,
      delta: computeDelta(current.medianHoursToConfirm ?? 0, previous.medianHoursToConfirm ?? 0),
      unit: "hours",
      hint: current.medianHoursToConfirm === null ? "لا توجد طلبات مؤكدة في الفترة" : "من إنشاء الطلب حتى تأكيده",
    },
    {
      key: "medianHoursToShip",
      label: "متوسط الوقت للشحن",
      value: current.medianHoursToShip ?? 0,
      previous: previous.medianHoursToShip ?? 0,
      delta: computeDelta(current.medianHoursToShip ?? 0, previous.medianHoursToShip ?? 0),
      unit: "hours",
      hint: current.medianHoursToShip === null ? "لا توجد طلبات مشحونة في الفترة" : "من التأكيد حتى الشحن",
    },
    {
      key: "overdueRate",
      label: "نسبة المتأخر",
      value: current.overdueRate,
      previous: previous.overdueRate,
      delta: computeDelta(current.overdueRate, previous.overdueRate),
      unit: "percent",
      hint: "من الطلبات المؤكدة/قيد التجهيز حاليًا مقابل مدة SLA الخاصة بك",
    },
    {
      key: "cancellationRate",
      label: "نسبة الإلغاء",
      value: current.cancellationRate,
      previous: previous.cancellationRate,
      delta: computeDelta(current.cancellationRate, previous.cancellationRate),
      unit: "percent",
      hint: "من كل الطلبات",
    },
    {
      key: "deliveredRate",
      label: "نسبة التسليم",
      value: current.deliveredRate,
      previous: previous.deliveredRate,
      delta: computeDelta(current.deliveredRate, previous.deliveredRate),
      unit: "percent",
      hint: "من كل الطلبات",
    },
  ];

  // --- slowest orders (by combined observed timing, highest first) ---
  const timingByOrder = new Map(currentTimings.map((t) => [t.orderId, t]));
  const slowestAll: SlowestOrderRow[] = currentOrders
    .map((o) => {
      const t = timingByOrder.get(o.id);
      return {
        orderId: o.id,
        createdAt: o.createdAt.toISOString(),
        status: o.status,
        hoursToConfirm: t?.hoursToConfirm ?? null,
        hoursToShip: t?.hoursToShip ?? null,
      };
    })
    .filter((r) => r.hoursToConfirm !== null || r.hoursToShip !== null)
    .sort((a, b) => (b.hoursToConfirm ?? 0) + (b.hoursToShip ?? 0) - ((a.hoursToConfirm ?? 0) + (a.hoursToShip ?? 0)));

  // --- cancellation reason breakdown ---
  const reasonMap = new Map<string, number>();
  for (const o of currentOrders) {
    if (o.status !== "CANCELLED") continue;
    const key = o.cancellationReason?.trim() || "غير محدد";
    reasonMap.set(key, (reasonMap.get(key) ?? 0) + 1);
  }
  const prevReasonMap = new Map<string, number>();
  for (const o of previousOrders) {
    if (o.status !== "CANCELLED") continue;
    const key = o.cancellationReason?.trim() || "غير محدد";
    prevReasonMap.set(key, (prevReasonMap.get(key) ?? 0) + 1);
  }
  const reasonRowsBase = Array.from(reasonMap.entries())
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((a, b) => b.count - a.count);
  const reasonRows: CancellationReasonRow[] = attachPreviousAndDelta(
    reasonRowsBase,
    (r) => r.key,
    (r) => r.count,
    prevReasonMap,
    { previousKey: "previousCount", deltaKey: "countDelta" }
  );

  const paginate = <T,>(rows: T[]): ReportBreakdownPage<T> => ({
    rows: rows.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE),
    page,
    pageSize: PAGE_SIZE,
    total: rows.length,
  });

  const actions: ReportAction[] = [];
  if (current.overdueRate > 0) {
    actions.push({ label: `${Math.round(current.overdueRate)}% من الطلبات المفتوحة متأخرة عن SLA`, href: "/partner/orders?overdue=1" });
  }

  return {
    period,
    comparisonLabel: formatComparisonLabel(period, (iso) => formatDateEn(iso)),
    headline,
    series: [],
    breakdowns: { slowest: paginate(slowestAll), cancellationReason: paginate(reasonRows) },
    actions,
    noAuditFootnote:
      current.noAuditCount > 0 ? `${current.noAuditCount} طلبًا بلا سجل تدقيق — مستثناة من حساب الوقت` : null,
  };
}
