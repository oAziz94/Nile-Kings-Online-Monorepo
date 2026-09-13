/**
 * Shared point-in-time stock totals (backlog 7.5) — the six aggregate numbers both the
 * inventory report's headline tiles (`partner-inventory-report.ts`) and the daily
 * `PartnerStockSnapshot` cron (`app/api/cron/stock-snapshot/route.ts`) need, extracted so
 * both call the exact same source of truth instead of two copies of the same arithmetic
 * drifting apart. All six are point-in-time (no report "period" — the only thing that
 * varies is `at`, the reference instant velocity/dead-stock windows are measured against).
 *
 * Split into a pure aggregation function (`aggregatePartnerStockTotals`, directly
 * unit-testable with hand-built input) and a thin Prisma-loading wrapper
 * (`computePartnerStockTotals`), per the task brief.
 */
import { prisma } from "@/lib/db";
import { getPartnerCostRate } from "@/lib/partner/cost-rate";

/** Fixed lookback window for the snapshot's own "days of cover" velocity — deliberately
 * *not* the inventory report's selected preset (7d/30d/90d/custom): a point-in-time
 * snapshot needs one stable definition so two snapshot rows are ever comparable to each
 * other, independent of whatever report period a partner happens to be looking at when the
 * live tile is rendered. Same window `lib/partner/stock-cover.ts` uses for the stock table. */
export const STOCK_TOTALS_VELOCITY_WINDOW_DAYS = 30;

export type StockTotalsInventoryRow = {
  variantId: string;
  stockAvailable: number;
  stockReserved: number;
  pricePiastres: number;
};

export type PartnerStockTotals = {
  sellableUnits: number;
  reservedUnits: number;
  valuationCostPiastres: number;
  valuationPricePiastres: number;
  /** Median days-of-cover across SKUs with measurable velocity in the fixed window; `null`
   * when no SKU sold anything in that window. */
  coverDays: number | null;
  deadStockSkus: number;
  outOfStockSkus: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Pure aggregation — no Prisma — directly unit-testable. `velocityPerDayByVariant` and
 * `lastSaleByVariant` are pre-computed lookups (from whatever fixed window/order scope the
 * caller chooses); a variant absent from either map is treated as zero velocity / never sold.
 */
export function aggregatePartnerStockTotals(
  inventories: StockTotalsInventoryRow[],
  costRateBps: number,
  deadStockDays: number,
  velocityPerDayByVariant: Map<string, number>,
  lastSaleByVariant: Map<string, Date>,
  at: Date
): PartnerStockTotals {
  let sellableUnits = 0;
  let reservedUnits = 0;
  let valuationCostPiastres = 0;
  let valuationPricePiastres = 0;
  let deadStockSkus = 0;
  let outOfStockSkus = 0;
  const coverValues: number[] = [];

  for (const inv of inventories) {
    const sellable = inv.stockAvailable - inv.stockReserved;
    sellableUnits += sellable;
    reservedUnits += inv.stockReserved;

    const unitCost = Math.round((inv.pricePiastres * costRateBps) / 10_000);
    valuationCostPiastres += sellable * unitCost;
    valuationPricePiastres += sellable * inv.pricePiastres;

    if (sellable <= 0) outOfStockSkus += 1;

    const lastSale = lastSaleByVariant.get(inv.variantId) ?? null;
    const daysSinceLastSale = lastSale ? Math.floor((at.getTime() - lastSale.getTime()) / 86_400_000) : null;
    const isDead = daysSinceLastSale === null ? true : daysSinceLastSale >= deadStockDays;
    if (isDead) deadStockSkus += 1;

    const velocityPerDay = velocityPerDayByVariant.get(inv.variantId) ?? 0;
    if (velocityPerDay > 0) coverValues.push(sellable / velocityPerDay);
  }

  return {
    sellableUnits,
    reservedUnits,
    valuationCostPiastres,
    valuationPricePiastres,
    coverDays: median(coverValues),
    deadStockSkus,
    outOfStockSkus,
  };
}

/**
 * Loads a partner's current inventory + cost rate + settings, computes the fixed-window
 * velocity/last-sale lookups, and calls `aggregatePartnerStockTotals`. `at` defaults to now;
 * the cron passes yesterday's Cairo end-of-day instant so the dead-stock/velocity windows
 * are measured relative to the day being snapshotted rather than the moment the job happens
 * to run. Note: `PartnerInventory.stockAvailable/stockReserved` themselves have no history —
 * they are always "as of now" — so `at` only affects the velocity/dead-stock *windows*, not
 * the quantities. The cron runs minutes after Cairo midnight specifically so this gap is
 * negligible in practice.
 */
export async function computePartnerStockTotals(partnerId: string, at: Date = new Date()): Promise<PartnerStockTotals> {
  const [partner, costRateBps, inventories] = await Promise.all([
    prisma.partner.findUniqueOrThrow({ where: { id: partnerId }, select: { deadStockDays: true } }),
    getPartnerCostRate(partnerId),
    prisma.partnerInventory.findMany({
      where: { partnerId, variant: { product: { active: true } } },
      select: {
        variantId: true,
        stockAvailable: true,
        stockReserved: true,
        variant: { select: { pricePiastres: true } },
      },
    }),
  ]);

  const rows: StockTotalsInventoryRow[] = inventories.map((inv) => ({
    variantId: inv.variantId,
    stockAvailable: inv.stockAvailable,
    stockReserved: inv.stockReserved,
    pricePiastres: inv.variant.pricePiastres,
  }));

  if (rows.length === 0) {
    return aggregatePartnerStockTotals([], costRateBps, partner.deadStockDays, new Map(), new Map(), at);
  }

  const variantIds = rows.map((r) => r.variantId);
  const since = new Date(at.getTime() - STOCK_TOTALS_VELOCITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [velocityGroups, saleRows] = await Promise.all([
    prisma.orderItem.groupBy({
      by: ["variantId"],
      where: {
        variantId: { in: variantIds },
        order: { assignedPartnerId: partnerId, status: { not: "CANCELLED" }, createdAt: { gte: since, lte: at } },
      },
      _sum: { quantity: true },
    }),
    prisma.orderItem.findMany({
      where: {
        variantId: { in: variantIds },
        order: { assignedPartnerId: partnerId, status: { not: "CANCELLED" }, createdAt: { lte: at } },
      },
      select: { variantId: true, order: { select: { createdAt: true } } },
    }),
  ]);

  const velocityPerDayByVariant = new Map(
    velocityGroups.map((g) => [g.variantId, (g._sum.quantity ?? 0) / STOCK_TOTALS_VELOCITY_WINDOW_DAYS])
  );

  const lastSaleByVariant = new Map<string, Date>();
  for (const row of saleRows) {
    const existing = lastSaleByVariant.get(row.variantId);
    if (!existing || row.order.createdAt > existing) lastSaleByVariant.set(row.variantId, row.order.createdAt);
  }

  return aggregatePartnerStockTotals(rows, costRateBps, partner.deadStockDays, velocityPerDayByVariant, lastSaleByVariant, at);
}

export type NearestSnapshotRow = {
  day: Date;
  sellableUnits: number;
  valuationPiastres: bigint;
  coverDays: number | null;
  deadStockSkus: number;
  outOfStockSkus: number;
};

/**
 * The `PartnerStockSnapshot` row on or nearest before `targetIso`, within `maxLookbackDays`
 * (default 7) — the inventory report's "compare against the snapshot on or nearest before
 * `period.previous.to`" rule. `null` when no row qualifies.
 */
export async function findNearestStockSnapshot(
  partnerId: string,
  targetIso: string,
  maxLookbackDays = 7
): Promise<NearestSnapshotRow | null> {
  const target = new Date(`${targetIso}T00:00:00.000Z`);
  const earliest = new Date(target.getTime() - maxLookbackDays * 24 * 60 * 60 * 1000);
  return prisma.partnerStockSnapshot.findFirst({
    where: { partnerId, day: { gte: earliest, lte: target } },
    orderBy: { day: "desc" },
    select: {
      day: true,
      sellableUnits: true,
      valuationPiastres: true,
      coverDays: true,
      deadStockSkus: true,
      outOfStockSkus: true,
    },
  });
}
