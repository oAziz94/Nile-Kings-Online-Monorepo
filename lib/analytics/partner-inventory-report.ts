/**
 * Inventory report (backlog 5.6a) — `GET /api/partner/reports/inventory`. Per-SKU velocity
 * is computed by `getSkuVelocityForPeriod` (non-CANCELLED orders over the selected preset,
 * 7/30/90 days). Dead-stock and the reorder suggestion use the partner's own
 * `deadStockDays`/`targetCoverDays` settings (defaults 60/21, `05-partner-portal-v2.md` §4.6).
 */
import { prisma } from "@/lib/db";
import { getPartnerCostRate } from "@/lib/partner/cost-rate";
import {
  computeDelta,
  daysOfCoverForVelocity,
  formatComparisonLabel,
  getSkuVelocityForPeriod,
  periodToDateRange,
  resolvePeriod,
  suggestedReorderQty,
  type InventoryReportPreset,
  type PartnerReportResponse,
  type ReportAction,
  type ReportBreakdownPage,
  type ReportHeadline,
  type ResolvedPeriod,
} from "./partner-reports";
import { computePartnerStockTotals, findNearestStockSnapshot, type NearestSnapshotRow, type PartnerStockTotals } from "./partner-stock-totals";
import { sumStockOutDays, type VariantStockOutInput } from "./stock-out-days";
import { formatDateEn } from "@/lib/format-en-numbers";
import { INVENTORY_EXPORT_HEADERS } from "@/lib/inventory/receipts";

export type InventorySkuRow = {
  variantId: string;
  productId: string;
  categoryId: string;
  productName: string;
  variantName: string;
  colorName: string | null;
  sku: string;
  sellable: number;
  velocityPerWeek: number;
  daysOfCover: number | null;
  isDead: boolean;
  isOut: boolean;
  suggestedReorder: number;
  pricePiastres: number;
};

export type InventoryReportBreakdowns = {
  sku: ReportBreakdownPage<InventorySkuRow>;
};

export type InventoryReportResponse = PartnerReportResponse<InventoryReportBreakdowns> & {
  reorderList: { totalUnits: number; estimatedCostPiastres: number; itemCount: number };
  deadStockValuePiastres: number;
  settings: { deadStockDays: number; targetCoverDays: number };
};

const PAGE_SIZE = 25;

export type InventoryReportFilter = "needsReorder" | "dead" | "all";

type PartnerReportSettings = { deadStockDays: number; targetCoverDays: number };

/**
 * Builds every SKU row (unfiltered, sorted by nearest-to-stock-out first) for one period.
 * Exported (backlog 9.5b, rule B3) so the network stock tab (`lib/analytics/network-stock.ts`)
 * reuses this exact query per partner instead of writing a fresh one — it never changes
 * behaviour for the partner-scoped callers above.
 */
export async function computeInventoryRows(
  partnerId: string,
  period: ReturnType<typeof resolvePeriod>
): Promise<{ rows: InventorySkuRow[]; partner: PartnerReportSettings; costRateBps: number }> {
  const [partner, costRateBps, currentVelocity, lastSaleByVariant] = await Promise.all([
    prisma.partner.findUniqueOrThrow({
      where: { id: partnerId },
      select: { deadStockDays: true, targetCoverDays: true },
    }),
    getPartnerCostRate(partnerId),
    getSkuVelocityForPeriod(partnerId, period.current),
    getLastSaleDateByVariant(partnerId),
  ]);

  const inventories = await prisma.partnerInventory.findMany({
    where: { partnerId, variant: { product: { active: true } } },
    select: {
      variantId: true,
      stockAvailable: true,
      stockReserved: true,
      variant: {
        select: {
          sku: true,
          name: true,
          colorName: true,
          pricePiastres: true,
          product: { select: { id: true, name: true, categoryId: true } },
        },
      },
    },
  });

  const now = new Date();
  const rows: InventorySkuRow[] = inventories.map((inv) => {
    const sellable = inv.stockAvailable - inv.stockReserved;
    const velocity = currentVelocity.get(inv.variantId);
    const velocityPerDay = velocity?.velocityPerDay ?? 0;
    const daysOfCover = daysOfCoverForVelocity(sellable, velocityPerDay);
    const lastSale = lastSaleByVariant.get(inv.variantId) ?? null;
    const daysSinceLastSale = lastSale ? Math.floor((now.getTime() - lastSale.getTime()) / 86_400_000) : null;
    const isDead = daysSinceLastSale === null ? true : daysSinceLastSale >= partner.deadStockDays;
    const suggestedReorder = suggestedReorderQty(partner.targetCoverDays, velocityPerDay, sellable);
    return {
      variantId: inv.variantId,
      productId: inv.variant.product.id,
      categoryId: inv.variant.product.categoryId,
      productName: inv.variant.product.name,
      variantName: inv.variant.name,
      colorName: inv.variant.colorName,
      sku: inv.variant.sku,
      sellable,
      velocityPerWeek: velocityPerDay * 7,
      daysOfCover,
      isDead,
      isOut: sellable <= 0,
      suggestedReorder,
      pricePiastres: inv.variant.pricePiastres,
    };
  });

  rows.sort((a, b) => {
    const aCover = a.daysOfCover ?? Infinity;
    const bCover = b.daysOfCover ?? Infinity;
    return aCover - bCover;
  });

  return { rows, partner, costRateBps };
}

/** Every SKU that needs a reorder, unpaginated — the CSV export's source of truth. */
export async function getPartnerReorderRows(
  partnerId: string,
  input: { preset: InventoryReportPreset; from?: string; to?: string }
): Promise<InventorySkuRow[]> {
  const period = resolvePeriod(input);
  const { rows } = await computeInventoryRows(partnerId, period);
  return rows.filter((r) => r.suggestedReorder > 0);
}

export async function getPartnerInventoryReport(
  partnerId: string,
  input: { preset: InventoryReportPreset; from?: string; to?: string; page?: number; filter?: InventoryReportFilter }
): Promise<InventoryReportResponse> {
  const period = resolvePeriod(input);
  const page = Math.max(1, input.page ?? 1);
  const filter = input.filter ?? "all";

  const { rows, partner, costRateBps } = await computeInventoryRows(partnerId, period);

  const filtered =
    filter === "needsReorder"
      ? rows.filter((r) => r.suggestedReorder > 0)
      : filter === "dead"
        ? rows.filter((r) => r.isDead)
        : rows;

  // Backlog 7.5 — the six point-in-time totals (shared with the daily snapshot cron via
  // `computePartnerStockTotals`), the ledger-accurate stock-out-days headline, and the
  // nearest-snapshot lookup for a real previous-period comparison, all in parallel.
  const [totals, stockOut, snapshot] = await Promise.all([
    computePartnerStockTotals(partnerId),
    computeStockOutHeadline(partnerId, rows, period),
    findNearestStockSnapshot(partnerId, period.previous.to),
  ]);

  const headline = buildHeadline(rows, totals, costRateBps, period.days, partner.deadStockDays, stockOut, snapshot);
  const start = (page - 1) * PAGE_SIZE;
  const skuPage: ReportBreakdownPage<InventorySkuRow> = {
    rows: filtered.slice(start, start + PAGE_SIZE),
    page,
    pageSize: PAGE_SIZE,
    total: filtered.length,
  };

  const reorderRows = rows.filter((r) => r.suggestedReorder > 0);
  const reorderList = {
    totalUnits: reorderRows.reduce((s, r) => s + r.suggestedReorder, 0),
    estimatedCostPiastres: reorderRows.reduce(
      (s, r) => s + r.suggestedReorder * Math.round((r.pricePiastres * costRateBps) / 10_000),
      0
    ),
    itemCount: reorderRows.length,
  };
  const deadStockValuePiastres = rows
    .filter((r) => r.isDead)
    .reduce((s, r) => s + r.sellable * Math.round((r.pricePiastres * costRateBps) / 10_000), 0);

  const actions: ReportAction[] = [];
  if (reorderRows.length > 0) {
    actions.push({ label: `قائمة إعادة الطلب (${reorderRows.length} صنفًا)`, exportHref: "reorder" });
  }
  const deadCount = rows.filter((r) => r.isDead).length;
  if (deadCount > 0) {
    actions.push({ label: `اعرض الأصناف الراكدة (${deadCount})`, href: "?filter=dead" });
  }

  return {
    period,
    comparisonLabel: formatComparisonLabel(period, (iso) => formatDateEn(iso)),
    headline,
    series: [],
    breakdowns: { sku: skuPage },
    actions,
    reorderList,
    deadStockValuePiastres,
    settings: { deadStockDays: partner.deadStockDays, targetCoverDays: partner.targetCoverDays },
  };
}

async function getLastSaleDateByVariant(partnerId: string): Promise<Map<string, Date>> {
  const items = await prisma.orderItem.findMany({
    where: { order: { assignedPartnerId: partnerId, status: { not: "CANCELLED" } } },
    select: { variantId: true, order: { select: { createdAt: true } } },
  });
  const map = new Map<string, Date>();
  for (const item of items) {
    const existing = map.get(item.variantId);
    if (!existing || item.order.createdAt > existing) {
      map.set(item.variantId, item.order.createdAt);
    }
  }
  return map;
}

/**
 * Ledger-accurate stock-out days for both the current and previous period (backlog 7.5),
 * over the same SKU set the report already loaded (`rows`, which carries each variant's
 * *current* sellable balance — exactly what `stock-out-days.ts`'s backwards walk needs).
 * Loads every ledger entry from the previous period's start through now, once, and reuses
 * it for both windows.
 */
async function computeStockOutHeadline(
  partnerId: string,
  rows: InventorySkuRow[],
  period: ResolvedPeriod
): Promise<{ current: number; previous: number }> {
  if (rows.length === 0) return { current: 0, previous: 0 };
  const variantIds = rows.map((r) => r.variantId);
  const since = periodToDateRange(period.previous).from;

  const ledgerRows = await prisma.inventoryLedger.findMany({
    where: { partnerId, variantId: { in: variantIds }, createdAt: { gte: since } },
    select: { variantId: true, createdAt: true, quantityAvailableDelta: true, quantityReservedDelta: true },
    orderBy: { createdAt: "asc" },
  });

  const entriesByVariant = new Map<string, typeof ledgerRows>();
  for (const row of ledgerRows) {
    const arr = entriesByVariant.get(row.variantId) ?? [];
    arr.push(row);
    entriesByVariant.set(row.variantId, arr);
  }

  const inputs: VariantStockOutInput[] = rows.map((r) => ({
    variantId: r.variantId,
    currentSellable: r.sellable,
    entries: entriesByVariant.get(r.variantId) ?? [],
  }));

  return {
    current: sumStockOutDays(inputs, period.current.from, period.current.to),
    previous: sumStockOutDays(inputs, period.previous.from, period.previous.to),
  };
}

function buildHeadline(
  rows: InventorySkuRow[],
  totals: PartnerStockTotals,
  costRateBps: number,
  days: number,
  deadStockDays: number,
  stockOut: { current: number; previous: number },
  snapshot: NearestSnapshotRow | null
): ReportHeadline[] {
  const coverValues = rows.map((r) => r.daysOfCover).filter((v): v is number => v !== null);
  const medianCover = median(coverValues);

  // Stock levels are point-in-time: with no snapshot row within 7 days of the previous
  // period's end, these tiles carry no comparison at all (rule 12's honest exception,
  // recorded in 04-decisions.md 2026-09-13) rather than a fabricated flat delta. Backlog
  // 7.5 adds a real comparison when a `PartnerStockSnapshot` row does exist — see
  // `withSnapshot` below. Both valuations are snapshotted (`valuationPiastres` = cost,
  // `valuationPricePiastres` = sale price, the latter nullable on rows written before it existed).
  const snapshotHint = "رصيد لحظي — بلا مقارنة";
  const periodHint = `على آخر ${days} يومًا`;
  const costRatePct = Math.round(costRateBps / 100);
  const snapshotDateLabel = snapshot ? `مقارنةً بلقطة ${formatDateEn(snapshot.day)}` : null;

  const point = (h: Omit<ReportHeadline, "previous" | "delta" | "noComparison">): ReportHeadline => ({
    ...h,
    previous: h.value,
    delta: computeDelta(h.value, h.value),
    noComparison: true,
  });

  /** Real comparison against the snapshot row when one exists and carries this field;
   * otherwise byte-for-byte the same `point()` fallback as today (spec: "when none exists
   * the current behaviour stays byte-for-byte"). */
  const withSnapshot = (
    h: Omit<ReportHeadline, "previous" | "delta" | "noComparison">,
    previousFromSnapshot: number | null | undefined,
    hintWithComparison: string | undefined
  ): ReportHeadline => {
    if (!snapshot || previousFromSnapshot === null || previousFromSnapshot === undefined) {
      return point(h);
    }
    return {
      ...h,
      hint: hintWithComparison ?? snapshotDateLabel!,
      previous: previousFromSnapshot,
      delta: computeDelta(h.value, previousFromSnapshot),
      noComparison: false,
    };
  };

  return [
    withSnapshot(
      { key: "sellable", label: "قابل للبيع", value: totals.sellableUnits, unit: "count", hint: snapshotHint },
      snapshot?.sellableUnits,
      snapshotDateLabel ?? undefined
    ),
    withSnapshot(
      {
        key: "valuationCost",
        label: "القيمة بالتكلفة",
        value: totals.valuationCostPiastres,
        unit: "piastres",
        hint: `بنسبتك ${costRatePct}% · ${snapshotHint}`,
      },
      snapshot ? Number(snapshot.valuationPiastres) : undefined,
      snapshot ? `بنسبتك ${costRatePct}% · ${snapshotDateLabel}` : undefined
    ),
    withSnapshot(
      { key: "valuationPrice", label: "القيمة بسعر البيع", value: totals.valuationPricePiastres, unit: "piastres", hint: snapshotHint },
      snapshot?.valuationPricePiastres === null || snapshot?.valuationPricePiastres === undefined ? undefined : Number(snapshot.valuationPricePiastres),
      snapshotDateLabel ?? undefined
    ),
    withSnapshot(
      { key: "medianCover", label: "متوسط التغطية", value: medianCover ?? 0, unit: "days", hint: `سرعة البيع ${periodHint}` },
      snapshot?.coverDays,
      snapshot ? `سرعة البيع ${periodHint} · ${snapshotDateLabel}` : undefined
    ),
    withSnapshot(
      { key: "deadStockCount", label: "أصناف راكدة", value: totals.deadStockSkus, unit: "count", hint: `بلا بيع منذ ${deadStockDays} يومًا` },
      snapshot?.deadStockSkus,
      snapshot ? `بلا بيع منذ ${deadStockDays} يومًا · ${snapshotDateLabel}` : undefined
    ),
    withSnapshot(
      { key: "stockOutSkus", label: "أصناف نافدة", value: totals.outOfStockSkus, unit: "count", hint: "قابل للبيع صفر أو أقل" },
      snapshot?.outOfStockSkus,
      snapshot ? `قابل للبيع صفر أو أقل · ${snapshotDateLabel}` : undefined
    ),
    {
      key: "stockOutDays",
      label: "أيام نفاد",
      value: stockOut.current,
      previous: stockOut.previous,
      delta: computeDelta(stockOut.current, stockOut.previous),
      unit: "count",
      hint: "مجموع أيام النفاد لكل الأصناف",
      noComparison: false,
    },
  ];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Reorder list as a CSV in the factory intake format (`lib/inventory/receipts.ts`'s
 * `INVENTORY_EXPORT_HEADERS`) — the "كمية مستلمة" column carries the suggested reorder qty
 * so the file re-imports through `/api/partner/inventory/import` (mode "receipt") with zero
 * row errors, per the backlog's own requirement.
 */
export function buildReorderCsv(rows: InventorySkuRow[], lowStockThreshold: number): string {
  const escape = (s: string | number) => {
    const str = String(s);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [
    [...INVENTORY_EXPORT_HEADERS].map(escape).join(","),
    ...rows
      .filter((r) => r.suggestedReorder > 0)
      .map((r) =>
        [
          r.sku,
          r.productName,
          r.variantName,
          r.colorName ?? "",
          r.sellable,
          0,
          r.sellable,
          lowStockThreshold,
          r.suggestedReorder,
          "",
        ]
          .map(escape)
          .join(",")
      ),
  ];
  return `﻿${lines.join("\n")}`;
}
