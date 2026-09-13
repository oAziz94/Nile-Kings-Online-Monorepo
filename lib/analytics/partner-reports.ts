/**
 * Partner reports platform (backlog 5.6a, `05-partner-portal-v2.md` §4.6 "the reporting
 * model": every report is a **period** with a **comparison** to the previous equal period,
 * a question it answers, and an **action** list; one response shape for every report
 * family). This module is the shared, database-free core (`resolvePeriod`, delta math, the
 * response types) plus the one database query every report family shares — per-SKU sales
 * velocity over an arbitrary period from the partner's own non-CANCELLED orders.
 *
 * Rule (12): every number on a report has a period and a comparison, or it is not a report.
 *
 * Note: a parallel task (5.4, `lib/partner/stock-cover.ts`) computes its own "days of
 * cover" column for the stock hub, over a *fixed* trailing-30-day window and DELIVERED-only
 * orders (`lib/analytics/queries.ts`'s `getStockReport`). This module's velocity is
 * deliberately different — an arbitrary period, non-CANCELLED orders — for the inventory
 * report's own reorder math. Do not conflate or import between them; the PM reconciles the
 * two views at merge time.
 */
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Period resolution
// ---------------------------------------------------------------------------

export type SalesReportPreset = "today" | "7d" | "30d" | "month" | "lastMonth" | "custom";
export type InventoryReportPreset = "7d" | "30d" | "90d" | "custom";
/** Money report (backlog 5.6b) — "منذ البداية" needs an unbounded lower edge; anchored at
 * a fixed early date rather than a real "no lower bound" since `resolvePeriod` always needs
 * a previous-period-of-equal-length too (previous is intentionally tiny/empty for this one —
 * the money headline that uses it is marked `noComparison` anyway). */
export type MoneyReportPreset = "month" | "lastMonth" | "90d" | "allTime" | "custom";
export type ReportPreset = SalesReportPreset | InventoryReportPreset | MoneyReportPreset;

/** Anchor for the "allTime" preset's `from` — well before this codebase's first order. */
export const ALL_TIME_FROM = "2020-01-01";

export type ReportPeriodRange = { from: string; to: string };

export type ResolvedPeriod = {
  preset: ReportPreset;
  /** Inclusive day count of the current period. */
  days: number;
  current: ReportPeriodRange;
  previous: ReportPeriodRange;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

function parseIso(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

/** Inclusive day span between two ISO dates (e.g. same day = 1). */
export function daySpanInclusive(fromIso: string, toIso: string): number {
  const ms = parseIso(toIso).getTime() - parseIso(fromIso).getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)) + 1);
}

/**
 * Resolves a report's current period from a preset (or an explicit custom `from`/`to`),
 * plus the immediately preceding period of equal length (non-overlapping — its `to` is the
 * day before the current period's `from`). `from`/`to` are only read when `preset ===
 * "custom"`; a future `to` is clamped to today.
 */
export function resolvePeriod(input: { preset: ReportPreset; from?: string; to?: string }): ResolvedPeriod {
  const today = todayIso();
  let current: ReportPeriodRange;

  switch (input.preset) {
    case "today":
      current = { from: today, to: today };
      break;
    case "7d":
      current = { from: addDaysIso(today, -6), to: today };
      break;
    case "30d":
      current = { from: addDaysIso(today, -29), to: today };
      break;
    case "90d":
      current = { from: addDaysIso(today, -89), to: today };
      break;
    case "month": {
      const d = new Date();
      current = { from: toIsoDate(new Date(d.getFullYear(), d.getMonth(), 1)), to: today };
      break;
    }
    case "lastMonth": {
      const d = new Date();
      const firstOfThisMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      const lastMonthEnd = new Date(firstOfThisMonth.getTime() - 24 * 60 * 60 * 1000);
      const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1);
      current = { from: toIsoDate(lastMonthStart), to: toIsoDate(lastMonthEnd) };
      break;
    }
    case "allTime":
      current = { from: ALL_TIME_FROM, to: today };
      break;
    case "custom": {
      if (!input.from || !input.to) {
        throw new Error("resolvePeriod: preset 'custom' requires from/to");
      }
      const from = input.from > today ? today : input.from;
      let to = input.to > today ? today : input.to;
      if (to < from) to = from;
      current = { from, to };
      break;
    }
    default:
      throw new Error(`resolvePeriod: unknown preset ${String(input.preset)}`);
  }

  const days = daySpanInclusive(current.from, current.to);
  const previousTo = addDaysIso(current.from, -1);
  const previousFrom = addDaysIso(previousTo, -(days - 1));
  return { preset: input.preset, days, current, previous: { from: previousFrom, to: previousTo } };
}

/** `resolvePeriod`'s current/previous as inclusive-day `Date` ranges for Prisma queries. */
export function periodToDateRange(range: ReportPeriodRange): { from: Date; to: Date } {
  const from = parseIso(range.from);
  const to = parseIso(range.to);
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

// ---------------------------------------------------------------------------
// Delta math
// ---------------------------------------------------------------------------

export type DeltaDirection = "up" | "down" | "flat";

export type Delta = {
  direction: DeltaDirection;
  /** current - previous, in the headline's own unit. */
  changeAbs: number;
  /** Percentage change vs. previous; `null` when previous is 0 and current is not (undefined %). */
  changePct: number | null;
};

/**
 * Pure delta between a current and previous period value. `changePct` is `null` only when
 * previous is 0 and current isn't (a percentage change from zero is undefined); previous ===
 * current === 0 reports a defined 0% change. Direction is purely sign-of-change — callers
 * decide whether "up" is good or bad for a given headline (e.g. cancellation rate).
 */
export function computeDelta(current: number, previous: number): Delta {
  const changeAbs = current - previous;
  const changePct = previous !== 0 ? (changeAbs / Math.abs(previous)) * 100 : current === 0 ? 0 : null;
  const direction: DeltaDirection = changeAbs > 0 ? "up" : changeAbs < 0 ? "down" : "flat";
  return { direction, changeAbs, changePct };
}

// ---------------------------------------------------------------------------
// The one response shape (§4.6)
// ---------------------------------------------------------------------------

export type ReportHeadline = {
  key: string;
  label: string;
  value: number;
  previous: number;
  delta: Delta;
  unit: "piastres" | "count" | "percent" | "days" | "hours";
  /** Secondary line under the value — which universe the number counts. */
  hint?: string;
  /** Point-in-time figures (stock levels) have no honest previous-period value; render no delta. */
  noComparison?: boolean;
};

export type ReportSeriesPoint = { x: string; y: number };

export type ReportSeries = {
  key: string;
  label: string;
  points: ReportSeriesPoint[];
  previousPoints: ReportSeriesPoint[];
};

export type ReportAction = {
  label: string;
  href?: string;
  exportHref?: string;
};

export type ReportBreakdownPage<TRow> = {
  rows: TRow[];
  page: number;
  pageSize: number;
  total: number;
};

export type PartnerReportResponse<TBreakdowns extends Record<string, unknown> = Record<string, unknown>> = {
  period: ResolvedPeriod;
  comparisonLabel: string;
  headline: ReportHeadline[];
  series: ReportSeries[];
  breakdowns: TBreakdowns;
  actions: ReportAction[];
};

/** Human comparison label per the artboard: "14 أغسطس – 13 سبتمبر · مقارنةً بـ 15 يوليو – 13 أغسطس". */
export function formatComparisonLabel(period: ResolvedPeriod, formatDate: (iso: string) => string): string {
  return `${formatDate(period.current.from)} – ${formatDate(period.current.to)} · مقارنةً بـ ${formatDate(period.previous.from)} – ${formatDate(period.previous.to)}`;
}

// ---------------------------------------------------------------------------
// Shared query: per-SKU sales velocity over an arbitrary period
// ---------------------------------------------------------------------------

export type SkuVelocity = {
  variantId: string;
  unitsSold: number;
  /** unitsSold / period days. */
  velocityPerDay: number;
};

/**
 * Units sold per variant, from the partner's own non-CANCELLED orders (`assignedPartnerId`)
 * created within `[from, to]` inclusive. Deliberately broader than `DELIVERED`-only (a
 * partner planning a reorder cares about demand, including orders still in flight) — see
 * this module's header note re: the parallel 5.4 stock-cover helper's different scope.
 */
export async function getSkuVelocityForPeriod(
  partnerId: string,
  range: ReportPeriodRange
): Promise<Map<string, SkuVelocity>> {
  const { from, to } = periodToDateRange(range);
  const days = daySpanInclusive(range.from, range.to);

  const groups = await prisma.orderItem.groupBy({
    by: ["variantId"],
    where: {
      order: {
        assignedPartnerId: partnerId,
        status: { not: "CANCELLED" },
        createdAt: { gte: from, lte: to },
      },
    },
    _sum: { quantity: true },
  });

  const map = new Map<string, SkuVelocity>();
  for (const g of groups) {
    const unitsSold = g._sum.quantity ?? 0;
    map.set(g.variantId, { variantId: g.variantId, unitsSold, velocityPerDay: unitsSold / days });
  }
  return map;
}

/** `Math.ceil(targetCoverDays * velocityPerDay - sellable)`, floored at 0 (never a negative "reorder"). */
export function suggestedReorderQty(targetCoverDays: number, velocityPerDay: number, sellable: number): number {
  return Math.max(0, Math.ceil(targetCoverDays * velocityPerDay - sellable));
}

/** Days of cover for the inventory report: sellable / velocityPerDay; `null` with no velocity. */
export function daysOfCoverForVelocity(sellable: number, velocityPerDay: number): number | null {
  if (velocityPerDay <= 0) return null;
  return sellable / velocityPerDay;
}

// ---------------------------------------------------------------------------
// Shared pure math (5.6b: fulfilment timing medians, money arithmetic)
// ---------------------------------------------------------------------------

/** The standard median (average of the two middle values on an even count); `null` on empty input. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ---------------------------------------------------------------------------
// Shared pure math (7.4: per-row previous-period deltas on breakdown tables)
// ---------------------------------------------------------------------------

/**
 * Attaches a previous-period value + `computeDelta` result to every row of a breakdown
 * table, keyed by `getKey`. A current row with no previous-period match compares against 0
 * (never invented) — matching the sales report's product-table convention this generalises.
 * `fields.previousKey`/`fields.deltaKey` name the two new fields per breakdown family (e.g.
 * `previousRevenuePiastres`/`revenueDelta`, `previousSalesPiastres`/`salesDelta`).
 */
export function attachPreviousAndDelta<T, PK extends string, DK extends string>(
  rows: T[],
  getKey: (row: T) => string,
  getCurrentValue: (row: T) => number,
  previousValueByKey: Map<string, number>,
  fields: { previousKey: PK; deltaKey: DK }
): (T & Record<PK, number> & Record<DK, Delta>)[] {
  return rows.map((row) => {
    const previous = previousValueByKey.get(getKey(row)) ?? 0;
    const extra = {
      [fields.previousKey]: previous,
      [fields.deltaKey]: computeDelta(getCurrentValue(row), previous),
    } as Record<PK, number> & Record<DK, Delta>;
    return { ...row, ...extra };
  });
}
