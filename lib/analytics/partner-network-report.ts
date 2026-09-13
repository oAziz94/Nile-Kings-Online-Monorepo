/**
 * Network report (backlog 5.6b, AGENT only) — `GET /api/partner/reports/network`. Question:
 * "how are my distributors doing?" Per `05-partner-portal-v2.md` §4.6: active distributors,
 * units transferred, requests pending, fill rate at the headline; per-distributor sales,
 * sellable, pending requests, fill rate and units transferred in the breakdown. Fill rate
 * reuses 5.5's own formula (`components/partner/network/distributor-detail.tsx`'s
 * `FillRateStrip`): `RestockRequestItem` carries no fulfilled-quantity field, so fill rate
 * is requested units on FULFILLED requests ÷ requested units on every non-CANCELLED request.
 */
import { prisma } from "@/lib/db";
import {
  computeDelta,
  formatComparisonLabel,
  periodToDateRange,
  resolvePeriod,
  type PartnerReportResponse,
  type ReportAction,
  type ReportBreakdownPage,
  type ReportHeadline,
  type SalesReportPreset,
} from "./partner-reports";
import { formatDateEn } from "@/lib/format-en-numbers";

export type DistributorNetworkRow = {
  partnerId: string;
  name: string;
  isActive: boolean;
  salesPiastres: number;
  sellable: number;
  pendingRequests: number;
  fillRatePct: number | null;
  unitsTransferred: number;
};

export type NetworkReportBreakdowns = {
  distributor: ReportBreakdownPage<DistributorNetworkRow>;
};

export type NetworkReportResponse = PartnerReportResponse<NetworkReportBreakdowns>;

const PAGE_SIZE = 25;
/** A distributor whose fill rate falls under this (with at least one eligible request) is
 * flagged by the "distributors under threshold" action. */
const FILL_RATE_ACTION_THRESHOLD_PCT = 50;

/** Fill rate for one set of restock requests — byte-equivalent to `FillRateStrip`'s formula. */
export function computeFillRatePct(
  requests: { status: string; items: { quantity: number }[] }[]
): number | null {
  const fulfilledUnits = requests
    .filter((r) => r.status === "FULFILLED")
    .reduce((sum, r) => sum + r.items.reduce((s, i) => s + i.quantity, 0), 0);
  const eligibleUnits = requests
    .filter((r) => r.status !== "CANCELLED")
    .reduce((sum, r) => sum + r.items.reduce((s, i) => s + i.quantity, 0), 0);
  return eligibleUnits > 0 ? (fulfilledUnits / eligibleUnits) * 100 : null;
}

export async function getPartnerNetworkReport(
  agentPartnerId: string,
  input: { preset: SalesReportPreset; from?: string; to?: string; page?: number }
): Promise<NetworkReportResponse> {
  const period = resolvePeriod(input);
  const page = Math.max(1, input.page ?? 1);
  const currentRange = periodToDateRange(period.current);
  const previousRange = periodToDateRange(period.previous);

  const distributors = await prisma.partner.findMany({
    where: { linkedAgentId: agentPartnerId, partnerType: "DISTRIBUTOR" },
    select: { id: true, name: true, isActive: true },
  });
  const distributorIds = distributors.map((d) => d.id);

  if (distributorIds.length === 0) {
    return {
      period,
      comparisonLabel: formatComparisonLabel(period, (iso) => formatDateEn(iso)),
      headline: buildHeadline(0, 0, 0, null, 0, 0, null),
      series: [],
      breakdowns: { distributor: { rows: [], page, pageSize: PAGE_SIZE, total: 0 } },
      actions: [],
    };
  }

  const [sales, sellableRows, requestsAll, ledgerCurrent, ledgerPrevious] = await Promise.all([
    prisma.order.groupBy({
      by: ["assignedPartnerId"],
      where: { assignedPartnerId: { in: distributorIds }, status: "DELIVERED", createdAt: { gte: currentRange.from, lte: currentRange.to } },
      _sum: { totalPiastres: true },
    }),
    prisma.partnerInventory.findMany({
      where: { partnerId: { in: distributorIds } },
      select: { partnerId: true, stockAvailable: true, stockReserved: true },
    }),
    prisma.restockRequest.findMany({
      where: { sourcePartnerId: agentPartnerId, destinationPartnerId: { in: distributorIds } },
      select: { destinationPartnerId: true, status: true, requestedAt: true, items: { select: { quantity: true } } },
    }),
    prisma.inventoryLedger.groupBy({
      by: ["partnerId"],
      where: { partnerId: { in: distributorIds }, reason: "TRANSFER_IN", createdAt: { gte: currentRange.from, lte: currentRange.to } },
      _sum: { quantityAvailableDelta: true },
    }),
    prisma.inventoryLedger.groupBy({
      by: ["partnerId"],
      where: { partnerId: { in: distributorIds }, reason: "TRANSFER_IN", createdAt: { gte: previousRange.from, lte: previousRange.to } },
      _sum: { quantityAvailableDelta: true },
    }),
  ]);

  const salesMap = new Map(sales.map((s) => [s.assignedPartnerId, s._sum.totalPiastres ?? 0]));
  const sellableMap = new Map<string, number>();
  for (const row of sellableRows) {
    sellableMap.set(row.partnerId, (sellableMap.get(row.partnerId) ?? 0) + Math.max(0, row.stockAvailable - row.stockReserved));
  }
  const ledgerCurrentMap = new Map(ledgerCurrent.map((r) => [r.partnerId, r._sum.quantityAvailableDelta ?? 0]));
  const ledgerPreviousMap = new Map(ledgerPrevious.map((r) => [r.partnerId, r._sum.quantityAvailableDelta ?? 0]));

  const requestsByDistributor = new Map<string, typeof requestsAll>();
  for (const r of requestsAll) {
    const list = requestsByDistributor.get(r.destinationPartnerId) ?? [];
    list.push(r);
    requestsByDistributor.set(r.destinationPartnerId, list);
  }

  const currentPeriodRequestsByDistributor = new Map<string, typeof requestsAll>();
  for (const r of requestsAll) {
    if (r.requestedAt >= currentRange.from && r.requestedAt <= currentRange.to) {
      const list = currentPeriodRequestsByDistributor.get(r.destinationPartnerId) ?? [];
      list.push(r);
      currentPeriodRequestsByDistributor.set(r.destinationPartnerId, list);
    }
  }

  const rows: DistributorNetworkRow[] = distributors.map((d) => {
    const allRequests = requestsByDistributor.get(d.id) ?? [];
    const pendingRequests = allRequests.filter((r) => r.status === "PENDING").length;
    const periodRequests = currentPeriodRequestsByDistributor.get(d.id) ?? [];
    return {
      partnerId: d.id,
      name: d.name,
      isActive: d.isActive,
      salesPiastres: salesMap.get(d.id) ?? 0,
      sellable: sellableMap.get(d.id) ?? 0,
      pendingRequests,
      fillRatePct: computeFillRatePct(periodRequests),
      unitsTransferred: ledgerCurrentMap.get(d.id) ?? 0,
    };
  });
  rows.sort((a, b) => (a.fillRatePct ?? 100) - (b.fillRatePct ?? 100));

  const activeDistributors = distributors.filter((d) => d.isActive).length;
  const totalUnitsTransferred = Array.from(ledgerCurrentMap.values()).reduce((s, v) => s + v, 0);
  const prevUnitsTransferred = Array.from(ledgerPreviousMap.values()).reduce((s, v) => s + v, 0);
  const totalPendingRequests = rows.reduce((s, r) => s + r.pendingRequests, 0);
  const overallFillRateCurrent = computeFillRatePct(requestsAll.filter((r) => r.requestedAt >= currentRange.from && r.requestedAt <= currentRange.to));
  const overallFillRatePrevious = computeFillRatePct(requestsAll.filter((r) => r.requestedAt >= previousRange.from && r.requestedAt <= previousRange.to));

  const headline = buildHeadline(
    activeDistributors,
    totalUnitsTransferred,
    prevUnitsTransferred,
    overallFillRateCurrent,
    overallFillRatePrevious ?? 0,
    totalPendingRequests,
    overallFillRatePrevious
  );

  const actions: ReportAction[] = [];
  const underThreshold = rows.filter((r) => r.fillRatePct !== null && r.fillRatePct < FILL_RATE_ACTION_THRESHOLD_PCT);
  if (underThreshold.length > 0) {
    actions.push({ label: `${underThreshold.length} موزعًا بمعدّل تنفيذ أقل من ${FILL_RATE_ACTION_THRESHOLD_PCT}%`, href: "/partner/network" });
  }

  return {
    period,
    comparisonLabel: formatComparisonLabel(period, (iso) => formatDateEn(iso)),
    headline,
    series: [],
    breakdowns: {
      distributor: {
        rows: rows.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE),
        page,
        pageSize: PAGE_SIZE,
        total: rows.length,
      },
    },
    actions,
  };
}

function buildHeadline(
  activeDistributors: number,
  unitsTransferred: number,
  prevUnitsTransferred: number,
  fillRateCurrent: number | null,
  fillRatePrevious: number,
  requestsPending: number,
  fillRatePreviousRaw: number | null
): ReportHeadline[] {
  return [
    {
      key: "activeDistributors",
      label: "موزعون نشطون",
      value: activeDistributors,
      previous: activeDistributors,
      delta: computeDelta(activeDistributors, activeDistributors),
      unit: "count",
      hint: "رصيد لحظي — بلا مقارنة",
      noComparison: true,
    },
    {
      key: "unitsTransferred",
      label: "قطع تم تحويلها",
      value: unitsTransferred,
      previous: prevUnitsTransferred,
      delta: computeDelta(unitsTransferred, prevUnitsTransferred),
      unit: "count",
      hint: "خلال الفترة",
    },
    {
      key: "requestsPending",
      label: "طلبات بانتظار الرد",
      value: requestsPending,
      previous: requestsPending,
      delta: computeDelta(requestsPending, requestsPending),
      unit: "count",
      hint: "رصيد لحظي — بلا مقارنة",
      noComparison: true,
    },
    {
      key: "fillRate",
      label: "معدّل التنفيذ",
      value: fillRateCurrent ?? 0,
      previous: fillRatePreviousRaw ?? 0,
      delta: computeDelta(fillRateCurrent ?? 0, fillRatePrevious),
      unit: "percent",
      hint: fillRateCurrent === null ? "لا توجد طلبات مؤهلة في الفترة" : "وحدات مطلوبة",
      noComparison: fillRateCurrent === null || fillRatePreviousRaw === null,
    },
  ];
}
