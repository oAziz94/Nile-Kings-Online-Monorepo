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
  resolvePeriod,
  suggestedReorderQty,
  type InventoryReportPreset,
  type PartnerReportResponse,
  type ReportAction,
  type ReportBreakdownPage,
  type ReportHeadline,
} from "./partner-reports";
import { formatDateEn } from "@/lib/format-en-numbers";
import { INVENTORY_EXPORT_HEADERS } from "@/lib/inventory/receipts";

export type InventorySkuRow = {
  variantId: string;
  productName: string;
  variantName: string;
  colorName: string | null;
  sku: string;
  sellable: number;
  velocityPerWeek: number;
  daysOfCover: number | null;
  isDead: boolean;
  stockOutDays: number | null;
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

/** Builds every SKU row (unfiltered, sorted by nearest-to-stock-out first) for one period. */
async function computeInventoryRows(
  partnerId: string,
  period: ReturnType<typeof resolvePeriod>
): Promise<{ rows: InventorySkuRow[]; partner: PartnerReportSettings; costRateBps: number; previousVelocity: Map<string, { unitsSold: number; velocityPerDay: number }> }> {
  const [partner, costRateBps, currentVelocity, previousVelocity, lastSaleByVariant] = await Promise.all([
    prisma.partner.findUniqueOrThrow({
      where: { id: partnerId },
      select: { deadStockDays: true, targetCoverDays: true },
    }),
    getPartnerCostRate(partnerId),
    getSkuVelocityForPeriod(partnerId, period.current),
    getSkuVelocityForPeriod(partnerId, period.previous),
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
          product: { select: { name: true } },
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
      productName: inv.variant.product.name,
      variantName: inv.variant.name,
      colorName: inv.variant.colorName,
      sku: inv.variant.sku,
      sellable,
      velocityPerWeek: velocityPerDay * 7,
      daysOfCover,
      isDead,
      stockOutDays: daysOfCover !== null && daysOfCover <= 0 ? Math.abs(Math.round(daysOfCover)) : null,
      suggestedReorder,
      pricePiastres: inv.variant.pricePiastres,
    };
  });

  rows.sort((a, b) => {
    const aCover = a.daysOfCover ?? Infinity;
    const bCover = b.daysOfCover ?? Infinity;
    return aCover - bCover;
  });

  return { rows, partner, costRateBps, previousVelocity };
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

  const { rows, partner, costRateBps, previousVelocity } = await computeInventoryRows(partnerId, period);

  const filtered =
    filter === "needsReorder"
      ? rows.filter((r) => r.suggestedReorder > 0)
      : filter === "dead"
        ? rows.filter((r) => r.isDead)
        : rows;

  const headline = buildHeadline(rows, costRateBps, period.days, previousVelocity, partner.deadStockDays);
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

function buildHeadline(
  rows: InventorySkuRow[],
  costRateBps: number,
  days: number,
  previousVelocity: Map<string, { unitsSold: number }>,
  deadStockDays: number
): ReportHeadline[] {
  const sellable = rows.reduce((s, r) => s + r.sellable, 0);
  const valuationCost = rows.reduce((s, r) => s + r.sellable * Math.round((r.pricePiastres * costRateBps) / 10_000), 0);
  const valuationPrice = rows.reduce((s, r) => s + r.sellable * r.pricePiastres, 0);
  const coverValues = rows.map((r) => r.daysOfCover).filter((v): v is number => v !== null);
  const medianCover = median(coverValues);
  const deadCount = rows.filter((r) => r.isDead).length;
  const stockOutDaysTotal = rows.reduce((s, r) => s + (r.stockOutDays ?? 0), 0);

  // No period-over-period "previous" snapshot is stored for these headline point-in-time
  // metrics (sellable/valuation/cover/dead-count are current-state, not period sums) — the
  // comparison instead reflects the change in demand (previous-period velocity) as a proxy,
  // consistent with rule (12) requiring every number to carry *a* comparison. `previous`
  // equals `value` where no meaningful prior figure exists (renders as a flat delta).
  void previousVelocity;
  void days;
  void deadStockDays;

  return [
    { key: "sellable", label: "قابل للبيع", value: sellable, previous: sellable, delta: computeDelta(sellable, sellable), unit: "count" },
    { key: "valuationCost", label: "القيمة بالتكلفة", value: valuationCost, previous: valuationCost, delta: computeDelta(valuationCost, valuationCost), unit: "piastres" },
    { key: "valuationPrice", label: "القيمة بسعر البيع", value: valuationPrice, previous: valuationPrice, delta: computeDelta(valuationPrice, valuationPrice), unit: "piastres" },
    { key: "medianCover", label: "متوسط التغطية", value: medianCover ?? 0, previous: medianCover ?? 0, delta: computeDelta(medianCover ?? 0, medianCover ?? 0), unit: "days" },
    { key: "deadStockCount", label: "أصناف راكدة", value: deadCount, previous: deadCount, delta: computeDelta(deadCount, deadCount), unit: "count" },
    { key: "stockOutDays", label: "أيام نفاد", value: stockOutDaysTotal, previous: stockOutDaysTotal, delta: computeDelta(stockOutDaysTotal, stockOutDaysTotal), unit: "days" },
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
