/**
 * Admin analytics queries.
 * Financial metrics include only orders with status DELIVERED.
 */

import { prisma } from "@/lib/db";
import { REPORT_ORDER_STATUS } from "./types";
import type { DateGranularity } from "./types";
import { ORDER_STATUSES } from "@/lib/constants/order-status";

function parseRange(from?: string | null, to?: string | null): { from: Date; to: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: fromDate, to: toDate };
}

type AnalyticsScope = { partnerId?: string | null };

function orderWhere(fromDate: Date, toDate: Date, scope: AnalyticsScope = {}) {
  return {
    status: REPORT_ORDER_STATUS,
    createdAt: { gte: fromDate, lte: toDate },
    ...(scope.partnerId ? { assignedPartnerId: scope.partnerId } : {}),
  } as const;
}

/** Net merchandise: product revenue after discounts, excluding shipping and COD. */
export function netMerchandisePiastres(order: {
  subtotalPiastres: number;
  discountPiastres: number;
  seniorFreeValuePiastres: number;
}): number {
  return (
    order.subtotalPiastres - order.discountPiastres - order.seniorFreeValuePiastres
  );
}

export type Kpis = {
  totalRevenuePiastres: number;
  netMerchandisePiastres: number;
  orderCount: number;
  period: { from: Date; to: Date };
};

export async function getKpis(
  from?: string | null,
  to?: string | null,
  scope: AnalyticsScope = {}
): Promise<Kpis> {
  const { from: fromDate, to: toDate } = parseRange(from, to);
  const where = orderWhere(fromDate, toDate, scope);

  const [revenueRow, orders] = await Promise.all([
    prisma.order.aggregate({
      where,
      _sum: { totalPiastres: true },
      _count: true,
    }),
    prisma.order.findMany({
      where,
      select: {
        subtotalPiastres: true,
        discountPiastres: true,
        seniorFreeValuePiastres: true,
      },
    }),
  ]);

  const netMerchandiseTotal = orders.reduce(
    (sum, o) => sum + netMerchandisePiastres(o),
    0
  );

  return {
    totalRevenuePiastres: revenueRow._sum.totalPiastres ?? 0,
    netMerchandisePiastres: netMerchandiseTotal,
    orderCount: revenueRow._count,
    period: { from: fromDate, to: toDate },
  };
}

export type RevenueBucket = {
  period: string;
  totalRevenuePiastres: number;
  netMerchandisePiastres: number;
  orderCount: number;
};

export async function getRevenueOverTime(
  granularity: DateGranularity,
  from?: string | null,
  to?: string | null,
  scope: AnalyticsScope = {}
): Promise<RevenueBucket[]> {
  const { from: fromDate, to: toDate } = parseRange(from, to);

  const orders = await prisma.order.findMany({
    where: orderWhere(fromDate, toDate, scope),
    select: {
      createdAt: true,
      totalPiastres: true,
      subtotalPiastres: true,
      discountPiastres: true,
      seniorFreeValuePiastres: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const formatKey = (d: Date): string => {
    if (granularity === "day") return d.toISOString().slice(0, 10);
    if (granularity === "week") {
      const start = new Date(d);
      start.setDate(start.getDate() - start.getDay());
      return start.toISOString().slice(0, 10);
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  const map = new Map<
    string,
    { totalRevenuePiastres: number; netMerchandisePiastres: number; orderCount: number }
  >();

  for (const o of orders) {
    const key = formatKey(o.createdAt);
    const cur = map.get(key) ?? {
      totalRevenuePiastres: 0,
      netMerchandisePiastres: 0,
      orderCount: 0,
    };
    cur.totalRevenuePiastres += o.totalPiastres;
    cur.netMerchandisePiastres += netMerchandisePiastres(o);
    cur.orderCount += 1;
    map.set(key, cur);
  }

  const result: RevenueBucket[] = [];
  for (const [period, v] of map.entries()) {
    result.push({
      period,
      totalRevenuePiastres: v.totalRevenuePiastres,
      netMerchandisePiastres: v.netMerchandisePiastres,
      orderCount: v.orderCount,
    });
  }
  result.sort((a, b) => a.period.localeCompare(b.period));
  return result;
}

export type ProductVariantReportRow = {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  colorName: string | null;
  sku: string;
  pricePiastres: number;
  stockAvailable: number;
  stockReserved: number;
  quantitySold: number;
  /** Sum of order line totals (pre order-level discount). */
  lineRevenuePiastres: number;
};

export async function getProductVariantReport(
  from?: string | null,
  to?: string | null,
  scope: AnalyticsScope = {}
): Promise<ProductVariantReportRow[]> {
  const { from: fromDate, to: toDate } = parseRange(from, to);

  const [variants, salesGroups] = await Promise.all([
    prisma.variant.findMany({
      where: { product: { active: true } },
      include: {
        product: { select: { id: true, name: true } },
      },
      orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
    }),
    prisma.orderItem.groupBy({
      by: ["variantId"],
      where: { order: orderWhere(fromDate, toDate, scope) },
      _sum: { quantity: true, totalPiastres: true },
    }),
  ]);

  const variantIds = variants.map((v) => v.id);
  // Stock lives only in PartnerInventory now: a scoped caller (partner report reused with an
  // admin's partner id) reads that one partner's row per variant, same as before; the network
  // caller (no scope.partnerId) sums every partner's row per variant with one grouped query —
  // never a per-variant read, and never a fallback to the (now-removed) Variant columns.
  const stockRows = scope.partnerId
    ? await prisma.partnerInventory.findMany({
        where: { partnerId: scope.partnerId, variantId: { in: variantIds } },
        select: { variantId: true, stockAvailable: true, stockReserved: true },
      })
    : (
        await prisma.partnerInventory.groupBy({
          by: ["variantId"],
          where: { variantId: { in: variantIds } },
          _sum: { stockAvailable: true, stockReserved: true },
        })
      ).map((g) => ({
        variantId: g.variantId,
        stockAvailable: g._sum.stockAvailable ?? 0,
        stockReserved: g._sum.stockReserved ?? 0,
      }));
  const stockByVariant = new Map(stockRows.map((r) => [r.variantId, r]));

  const soldMap = new Map(
    salesGroups.map((g) => [
      g.variantId,
      {
        quantitySold: g._sum.quantity ?? 0,
        lineRevenuePiastres: g._sum.totalPiastres ?? 0,
      },
    ])
  );

  return variants.map((v) => {
    const sold = soldMap.get(v.id);
    const stock = stockByVariant.get(v.id);
    return {
      productId: v.product.id,
      productName: v.product.name,
      variantId: v.id,
      variantName: v.name,
      colorName: v.colorName,
      sku: v.sku,
      pricePiastres: v.pricePiastres,
      stockAvailable: stock?.stockAvailable ?? 0,
      stockReserved: stock?.stockReserved ?? 0,
      quantitySold: sold?.quantitySold ?? 0,
      lineRevenuePiastres: sold?.lineRevenuePiastres ?? 0,
    };
  });
}

/**
 * Partner stock report (backlog 4.22) — per active variant, scoped to one partner's own
 * inventory: available/reserved/sellable, units sold in the trailing 30 days of DELIVERED
 * orders assigned to the partner, daily velocity, and days of cover. `low`/`out` are
 * evaluated against `Partner.lowStockThreshold` (mutually exclusive: `out` when sellable
 * is at or below zero, `low` when sellable is positive but at/below the threshold).
 * Unlike `getProductVariantReport`, this is partner-only (no admin/no-scope caller) and the
 * 30-day sales window is fixed — independent of the report page's selected date range.
 */
export type StockReportRow = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  colorName: string | null;
  sku: string;
  stockAvailable: number;
  stockReserved: number;
  sellable: number;
  unitsSold30d: number;
  dailyVelocity: number;
  daysOfCover: number | null;
  low: boolean;
  out: boolean;
};

export type StockRowMetrics = {
  sellable: number;
  dailyVelocity: number;
  daysOfCover: number | null;
  low: boolean;
  out: boolean;
};

/**
 * Pure calculation for one stock-report row, split out of `getStockReport` so it can be
 * unit-tested without a database. `out`/`low` are mutually exclusive: `out` wins when
 * sellable is at or below zero (even if that's also `<= threshold`).
 */
export function computeStockRowMetrics({
  stockAvailable,
  stockReserved,
  unitsSold30d,
  threshold,
}: {
  stockAvailable: number;
  stockReserved: number;
  unitsSold30d: number;
  threshold: number;
}): StockRowMetrics {
  const sellable = stockAvailable - stockReserved;
  const dailyVelocity = unitsSold30d / 30;
  const daysOfCover = dailyVelocity > 0 ? sellable / dailyVelocity : null;
  return {
    sellable,
    dailyVelocity,
    daysOfCover,
    out: sellable <= 0,
    low: sellable > 0 && sellable <= threshold,
  };
}

export async function getStockReport(partnerId: string): Promise<StockReportRow[]> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [partner, variants, salesGroups] = await Promise.all([
    prisma.partner.findUnique({
      where: { id: partnerId },
      select: { lowStockThreshold: true },
    }),
    // Scoped to variants the partner actually stocks (has a `PartnerInventory` row for) —
    // unlike `getProductVariantReport` (which lists every active variant store-wide, with a
    // fallback to global stock, for the store-wide admin view this scope is shared with),
    // a partner's own stock report about products they don't carry is both noise and, at
    // full-catalog scale (thousands of variants), an unpaginated client-side render that
    // makes the page unusably slow for no benefit.
    prisma.variant.findMany({
      where: { product: { active: true }, partnerInventories: { some: { partnerId } } },
      include: {
        product: { select: { id: true, name: true } },
        partnerInventories: {
          where: { partnerId },
          select: { stockAvailable: true, stockReserved: true },
        },
      },
      orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
    }),
    prisma.orderItem.groupBy({
      by: ["variantId"],
      where: {
        order: {
          status: REPORT_ORDER_STATUS,
          assignedPartnerId: partnerId,
          createdAt: { gte: thirtyDaysAgo, lte: now },
        },
      },
      _sum: { quantity: true },
    }),
  ]);

  const threshold = partner?.lowStockThreshold ?? 5;
  const soldMap = new Map(salesGroups.map((g) => [g.variantId, g._sum.quantity ?? 0]));

  return variants.map((v) => {
    // The query above scoped variants to `partnerInventories: { some: { partnerId } } }`, so
    // this partner always has a row here — stock lives only in PartnerInventory now, no
    // fallback to the (removed) Variant columns.
    const inv = v.partnerInventories[0] ?? null;
    const stockAvailable = inv?.stockAvailable ?? 0;
    const stockReserved = inv?.stockReserved ?? 0;
    const unitsSold30d = soldMap.get(v.id) ?? 0;
    const metrics = computeStockRowMetrics({ stockAvailable, stockReserved, unitsSold30d, threshold });
    return {
      variantId: v.id,
      productId: v.product.id,
      productName: v.product.name,
      variantName: v.name,
      colorName: v.colorName,
      sku: v.sku,
      stockAvailable,
      stockReserved,
      unitsSold30d,
      ...metrics,
    };
  });
}

/**
 * Partner order funnel (backlog 4.22) — counts of orders assigned to the partner, created
 * within the selected period, grouped by current status (all statuses, cancelled included).
 * Unlike the revenue/KPI queries, this deliberately does not filter to `DELIVERED` only —
 * the whole point is to show where orders currently sit across the funnel.
 */
export type OrderFunnelRow = {
  status: string;
  count: number;
};

export async function getOrderFunnel(
  from?: string | null,
  to?: string | null,
  scope: AnalyticsScope = {}
): Promise<OrderFunnelRow[]> {
  const { from: fromDate, to: toDate } = parseRange(from, to);

  const groups = await prisma.order.groupBy({
    by: ["status"],
    where: {
      createdAt: { gte: fromDate, lte: toDate },
      ...(scope.partnerId ? { assignedPartnerId: scope.partnerId } : {}),
    },
    _count: true,
  });

  const map = new Map(groups.map((g) => [g.status, g._count]));
  return ORDER_STATUSES.map((status) => ({ status, count: map.get(status) ?? 0 }));
}
