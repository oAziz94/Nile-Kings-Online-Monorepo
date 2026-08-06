/**
 * Admin analytics queries.
 * Financial metrics include only orders with status DELIVERED.
 */

import { prisma } from "@/lib/db";
import { REPORT_ORDER_STATUS } from "./types";
import type { DateGranularity } from "./types";

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
        partnerInventories: {
          where: { partnerId: scope.partnerId ?? "__no_partner_scope__" },
          select: { stockAvailable: true, stockReserved: true },
        },
      },
      orderBy: [{ product: { name: "asc" } }, { sku: "asc" }],
    }),
    prisma.orderItem.groupBy({
      by: ["variantId"],
      where: { order: orderWhere(fromDate, toDate, scope) },
      _sum: { quantity: true, totalPiastres: true },
    }),
  ]);

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
    const partnerInventory = v.partnerInventories[0] ?? null;
    return {
      productId: v.product.id,
      productName: v.product.name,
      variantId: v.id,
      variantName: v.name,
      colorName: v.colorName,
      sku: v.sku,
      pricePiastres: v.pricePiastres,
      stockAvailable: partnerInventory?.stockAvailable ?? v.stockAvailable,
      stockReserved: partnerInventory?.stockReserved ?? v.stockReserved,
      quantitySold: sold?.quantitySold ?? 0,
      lineRevenuePiastres: sold?.lineRevenuePiastres ?? 0,
    };
  });
}
