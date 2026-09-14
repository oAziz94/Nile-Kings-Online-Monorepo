/**
 * اليوم (the admin's queue) — backlog 9.2, `06-admin-v2.md` §3.1. Every number here calls an
 * existing `lib/**` function widened in scope (rule B3): `findOverdueAssignedOrders` (lifted
 * out of the partner today route), `getPartnerReorderRows`/`computeInventoryRows` (the
 * inventory report), `getPartnerStatementRows`/`computeBalance` (the money report), `getKpis`/
 * `getRevenueOverTime` (already partner-optional), and `getNetworkOnTimeRate` (the fulfilment
 * report's overdue math widened to no partner scope). Nothing here re-implements a partner
 * computation — it calls the same function with a wider scope.
 */
import { prisma } from "@/lib/db";
import { findOverdueAssignedOrders, buildTrendSeries } from "@/lib/partner/today";
import { resolveThreshold } from "@/lib/partner/resolve-threshold";
import { getKpis, getRevenueOverTime } from "@/lib/analytics/queries";
import { getNetworkOnTimeRate } from "@/lib/analytics/partner-fulfilment-report";
import { getPartnerReorderRows } from "@/lib/analytics/partner-inventory-report";
import { getPartnerStatementRows, computeBalance } from "@/lib/analytics/partner-money-report";
import { cairoDateIso, cairoStartOfDayUtc, addDaysIsoUtc } from "@/lib/analytics/cairo-day";
import { getOrderTicketSubjectLabel } from "@/lib/constants/order-ticket";
import { describeAdminAudit } from "@/lib/audit/describe-admin-audit";
import { resolveActorNames } from "@/lib/audit/resolve-actor-names";

const TREND_DAYS = 30;
const ROWS_PER_CARD = 3;

export type AdminTodayGroup<T> = { count: number; rows: T[] };

export type UnassignedOrderRow = { id: string; customerName: string; governorate: string; createdAt: string };
export type OverdueOrderRow = {
  id: string;
  partnerName: string;
  status: string;
  overdueHours: number;
};
export type TicketQueueRow = { id: string; orderId: string; subjectLabel: string; createdAt: string };
export type PartnerRequestRow = {
  id: string;
  name: string;
  requestTypeLabel: string;
  governorate: string;
  createdAt: string;
};
export type LowStockQueueRow = {
  variantId: string;
  sku: string;
  variantLabel: string;
  partnerId: string;
  partnerName: string;
  sellable: number;
  threshold: number;
};
export type DueBalanceRow = {
  partnerId: string;
  partnerName: string;
  amountPiastres: number;
  kindLabel: string;
  dueAt: string;
  overdue: boolean;
  daysFromNow: number;
};

export type AdminTodayQueues = {
  unassigned: AdminTodayGroup<UnassignedOrderRow>;
  overdue: AdminTodayGroup<OverdueOrderRow>;
  tickets: AdminTodayGroup<TicketQueueRow>;
  partnerRequests: AdminTodayGroup<PartnerRequestRow>;
  lowStock: AdminTodayGroup<LowStockQueueRow>;
  duePayments: AdminTodayGroup<DueBalanceRow>;
};

export type AdminTodayKpis = {
  ordersToday: number;
  ordersYesterday: number;
  revenueDeliveredWeekPiastres: number;
  revenueDeliveredPrevWeekPiastres: number;
  cancellationRate30: number;
  cancellationRatePrev30: number;
  onTimeRate30: number;
  onTimeRatePrev30: number;
};

export type AdminTodayTrendPoint = { date: string; revenuePiastres: number; orderCount: number };

export type AdminRecentActivityRow = {
  id: string;
  actorName: string;
  sentence: string;
  createdAt: string;
};

export type AdminTodayResponse = {
  queues: AdminTodayQueues;
  kpis: AdminTodayKpis;
  trend: AdminTodayTrendPoint[];
  previousTrend: AdminTodayTrendPoint[];
  trendError: boolean;
  recent: AdminRecentActivityRow[];
};

const PARTNER_REQUEST_TYPE_LABELS: Record<string, string> = {
  AGENT: "وكيل",
  DISTRIBUTOR: "موزع",
};

function relativeCairoDaysFromNow(target: Date, now: Date): number {
  const targetDay = cairoDateIso(target);
  const nowDay = cairoDateIso(now);
  const targetUtc = Date.parse(`${targetDay}T00:00:00.000Z`);
  const nowUtc = Date.parse(`${nowDay}T00:00:00.000Z`);
  return Math.round((targetUtc - nowUtc) / 86_400_000);
}

/** طلبات بلا شريك — orders never routed to a partner, oldest first. */
async function buildUnassignedQueue(): Promise<AdminTodayGroup<UnassignedOrderRow>> {
  const orders = await prisma.order.findMany({
    where: { assignedPartnerId: null, status: { notIn: ["DELIVERED", "CANCELLED"] } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      createdAt: true,
      shippingAddress: true,
      user: { select: { name: true, phone: true } },
    },
  });
  const rows: UnassignedOrderRow[] = orders.map((o) => {
    const address = (o.shippingAddress ?? {}) as { governorate?: string };
    return {
      id: o.id,
      customerName: o.user.name?.trim() || o.user.phone,
      governorate: address.governorate ?? "—",
      createdAt: o.createdAt.toISOString(),
    };
  });
  return { count: rows.length, rows: rows.slice(0, ROWS_PER_CARD) };
}

/** متأخرة عند الشريك — every partner, via the shared `findOverdueAssignedOrders({})`. */
async function buildOverdueQueue(): Promise<AdminTodayGroup<OverdueOrderRow>> {
  const overdue = await findOverdueAssignedOrders({});
  const rows: OverdueOrderRow[] = overdue.map((o) => ({
    id: o.id,
    partnerName: o.partnerName,
    status: o.status,
    overdueHours: o.overdueHours,
  }));
  return { count: rows.length, rows: rows.slice(0, ROWS_PER_CARD) };
}

/** أسئلة بانتظار الرد — OPEN order tickets, newest first. */
async function buildTicketsQueue(): Promise<AdminTodayGroup<TicketQueueRow>> {
  const tickets = await prisma.orderTicket.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
    select: { id: true, orderId: true, subject: true, createdAt: true },
  });
  const rows: TicketQueueRow[] = tickets.map((t) => ({
    id: t.id,
    orderId: t.orderId,
    subjectLabel: getOrderTicketSubjectLabel(t.subject),
    createdAt: t.createdAt.toISOString(),
  }));
  return { count: rows.length, rows: rows.slice(0, ROWS_PER_CARD) };
}

/** طلبات شراكة جديدة — PENDING `PartnerRequest` rows. */
async function buildPartnerRequestsQueue(): Promise<AdminTodayGroup<PartnerRequestRow>> {
  const requests = await prisma.partnerRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, requestType: true, governorate: true, createdAt: true },
  });
  const rows: PartnerRequestRow[] = requests.map((r) => ({
    id: r.id,
    name: r.name,
    requestTypeLabel: PARTNER_REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType,
    governorate: r.governorate,
    createdAt: r.createdAt.toISOString(),
  }));
  return { count: rows.length, rows: rows.slice(0, ROWS_PER_CARD) };
}

/**
 * أصناف نافدة أو قاربت — every active partner's `getPartnerReorderRows` (the inventory
 * report's own "needs reorder" query, B3: no new stock query), lowest sellable first. The
 * per-row threshold ("الحد M") is now the **resolved** threshold
 * (`resolveThreshold(partnerId).forVariant({productId, categoryId})`, backlog 9.5b) —
 * `InventorySkuRow` carries `productId`/`categoryId` since 9.5, so the network queue no
 * longer falls back to the partner-wide default.
 */
async function buildLowStockQueue(): Promise<AdminTodayGroup<LowStockQueueRow>> {
  const partners = await prisma.partner.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  // One round trip per partner, all partners at once — the dashboard must not scale linearly
  // with the network (9.2 verifier: 3.6 s for 13 partners when run one after another).
  const perPartner = await Promise.all(
    partners.map(async (partner) => {
      const [reorderRows, threshold] = await Promise.all([
        getPartnerReorderRows(partner.id, { preset: "30d" }),
        resolveThreshold(partner.id),
      ]);
      return { partner, reorderRows, threshold };
    })
  );
  const rows: LowStockQueueRow[] = [];
  for (const { partner, reorderRows, threshold } of perPartner) {
    for (const r of reorderRows) {
      rows.push({
        variantId: r.variantId,
        sku: r.sku,
        variantLabel: [r.variantName, r.colorName].filter(Boolean).join(" · "),
        partnerId: partner.id,
        partnerName: partner.name,
        sellable: r.sellable,
        threshold: threshold.forVariant({ productId: r.productId, categoryId: r.categoryId }),
      });
    }
  }
  rows.sort((a, b) => a.sellable - b.sellable);
  return { count: rows.length, rows: rows.slice(0, ROWS_PER_CARD) };
}

/**
 * مستحقات شركاء — active partners with a positive balance (`computeBalance`, the money
 * report's own arithmetic) whose latest recorded payment carries a `dueAt` at most 7 days
 * from now (overdue or due this week).
 */
async function buildDuePaymentsQueue(now: Date): Promise<AdminTodayGroup<DueBalanceRow>> {
  const partners = await prisma.partner.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  const horizon = new Date(now.getTime() + 7 * 86_400_000);
  const statements = await Promise.all(
    partners.map(async (partner) => ({ partner, ...(await getPartnerStatementRows(partner.id)) }))
  );
  const rows: DueBalanceRow[] = [];
  for (const { partner, receipts, payments } of statements) {
    if (payments.length === 0) continue;
    const receivedAllTime = receipts.reduce((s, r) => s + r.totalCostPiastres, 0);
    const paidAllTime = payments.reduce((s, p) => s + p.amountPiastres, 0);
    const balance = computeBalance(receivedAllTime, paidAllTime);
    if (balance <= 0) continue;

    // "Latest payment" = the most recently recorded row that carries a dueAt (payments are
    // already ordered `paidAt: desc` by `getPartnerStatementRows`).
    const latest = payments.find((p) => p.dueAt);
    if (!latest || !latest.dueAt) continue;
    const dueAt = new Date(latest.dueAt);
    if (dueAt.getTime() > horizon.getTime()) continue;

    rows.push({
      partnerId: partner.id,
      partnerName: partner.name,
      amountPiastres: latest.amountPiastres,
      kindLabel: latest.kind === "DOWN_PAYMENT" ? "دفعة مقدمة" : "قسط",
      dueAt: dueAt.toISOString(),
      overdue: dueAt.getTime() < now.getTime(),
      daysFromNow: relativeCairoDaysFromNow(dueAt, now),
    });
  }
  rows.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  return { count: rows.length, rows: rows.slice(0, ROWS_PER_CARD) };
}

async function buildKpis(now: Date): Promise<AdminTodayKpis> {
  const todayIso = cairoDateIso(now);
  const yesterdayIso = addDaysIsoUtc(todayIso, -1);
  const startOfToday = cairoStartOfDayUtc(todayIso);
  const startOfYesterday = cairoStartOfDayUtc(yesterdayIso);

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 86_400_000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000);

  const [
    ordersToday,
    ordersYesterday,
    revenueThisWeek,
    revenuePrevWeek,
    createdCurrent30,
    cancelledCurrent30,
    createdPrev30,
    cancelledPrev30,
    onTimeRate30,
    onTimeRatePrev30,
  ] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: startOfToday }, status: { not: "CANCELLED" } } }),
    prisma.order.count({
      where: { createdAt: { gte: startOfYesterday, lt: startOfToday }, status: { not: "CANCELLED" } },
    }),
    getKpis(sevenDaysAgo.toISOString(), now.toISOString()),
    getKpis(fourteenDaysAgo.toISOString(), sevenDaysAgo.toISOString()),
    prisma.order.count({ where: { createdAt: { gte: thirtyDaysAgo, lte: now } } }),
    prisma.order.count({ where: { createdAt: { gte: thirtyDaysAgo, lte: now }, status: "CANCELLED" } }),
    prisma.order.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo } } }),
    prisma.order.count({ where: { createdAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo }, status: "CANCELLED" } }),
    getNetworkOnTimeRate({ from: thirtyDaysAgo, to: now }, now),
    getNetworkOnTimeRate({ from: sixtyDaysAgo, to: thirtyDaysAgo }, now),
  ]);

  return {
    ordersToday,
    ordersYesterday,
    revenueDeliveredWeekPiastres: revenueThisWeek.netMerchandisePiastres,
    revenueDeliveredPrevWeekPiastres: revenuePrevWeek.netMerchandisePiastres,
    cancellationRate30: createdCurrent30 > 0 ? (cancelledCurrent30 / createdCurrent30) * 100 : 0,
    cancellationRatePrev30: createdPrev30 > 0 ? (cancelledPrev30 / createdPrev30) * 100 : 0,
    onTimeRate30,
    onTimeRatePrev30,
  };
}

async function buildTrend(now: Date): Promise<{ trend: AdminTodayTrendPoint[]; previousTrend: AdminTodayTrendPoint[]; trendError: boolean }> {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  try {
    const [currentBuckets, previousBuckets] = await Promise.all([
      getRevenueOverTime(
        "day",
        new Date(startOfToday.getTime() - (TREND_DAYS - 1) * 86_400_000).toISOString(),
        now.toISOString()
      ),
      getRevenueOverTime(
        "day",
        new Date(startOfToday.getTime() - (2 * TREND_DAYS - 1) * 86_400_000).toISOString(),
        new Date(startOfToday.getTime() - TREND_DAYS * 86_400_000).toISOString()
      ),
    ]);
    const trend = buildTrendSeries(currentBuckets, TREND_DAYS, now);
    const previousPeriodEnd = new Date(startOfToday.getTime() - TREND_DAYS * 86_400_000);
    const previousTrend = buildTrendSeries(previousBuckets, TREND_DAYS, previousPeriodEnd);
    return { trend, previousTrend, trendError: false };
  } catch {
    return { trend: [], previousTrend: [], trendError: true };
  }
}

/** آخر النشاط — the five newest `AdminAuditLog` rows, described in plain Arabic. */
async function buildRecentActivity(viewerUserId: string, limit = 5): Promise<AdminRecentActivityRow[]> {
  const rows = await prisma.adminAuditLog.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  if (rows.length === 0) return [];
  const actorNameById = await resolveActorNames(rows.map((r) => r.actorUserId), viewerUserId);

  return rows.map((row) => {
    const actorName = actorNameById.get(row.actorUserId) ?? "مستخدم محذوف";
    return {
      id: row.id,
      actorName,
      sentence: describeAdminAudit({
        action: row.action,
        entityType: row.entityType,
        entityLabel: row.entityLabel,
        before: row.before,
        after: row.after,
      }),
      createdAt: row.createdAt.toISOString(),
    };
  });
}

export async function getAdminToday(viewerUserId: string): Promise<AdminTodayResponse> {
  const now = new Date();

  const [unassigned, overdue, tickets, partnerRequests, lowStock, duePayments, kpis, trendResult, recent] =
    await Promise.all([
      buildUnassignedQueue(),
      buildOverdueQueue(),
      buildTicketsQueue(),
      buildPartnerRequestsQueue(),
      buildLowStockQueue(),
      buildDuePaymentsQueue(now),
      buildKpis(now),
      buildTrend(now),
      buildRecentActivity(viewerUserId),
    ]);

  return {
    queues: { unassigned, overdue, tickets, partnerRequests, lowStock, duePayments },
    kpis,
    trend: trendResult.trend,
    previousTrend: trendResult.previousTrend,
    trendError: trendResult.trendError,
    recent,
  };
}
