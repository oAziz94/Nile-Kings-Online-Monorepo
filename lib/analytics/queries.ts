/**
 * Admin analytics queries.
 * Revenue and counts use CONFIRMED + PROCESSING + SHIPPED + DELIVERED only.
 */

import { prisma } from "@/lib/db";
import type { DateGranularity } from "./types";
import { CONFIRMED_ORDER_STATUSES } from "./types";

const CONFIRMED = CONFIRMED_ORDER_STATUSES as unknown as string[];

function parseRange(from?: string | null, to?: string | null): { from: Date; to: Date } {
  const toDate = to ? new Date(to) : new Date();
  const fromDate = from ? new Date(from) : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from: fromDate, to: toDate };
}

export type Kpis = {
  totalRevenuePiastres: number;
  orderCount: number;
  productCount: number;
  customerCount: number;
  period: { from: Date; to: Date };
};

export async function getKpis(from?: string | null, to?: string | null): Promise<Kpis> {
  const { from: fromDate, to: toDate } = parseRange(from, to);

  const [revenueRow, orderCount, productCount, customerCount] = await Promise.all([
    prisma.order.aggregate({
      where: {
        status: { in: CONFIRMED },
        createdAt: { gte: fromDate, lte: toDate },
      },
      _sum: { totalPiastres: true },
    }),
    prisma.order.count({
      where: {
        status: { in: CONFIRMED },
        createdAt: { gte: fromDate, lte: toDate },
      },
    }),
    prisma.product.count({ where: { active: true } }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
  ]);

  return {
    totalRevenuePiastres: revenueRow._sum.totalPiastres ?? 0,
    orderCount,
    productCount,
    customerCount,
    period: { from: fromDate, to: toDate },
  };
}

export type RevenueBucket = { period: string; revenuePiastres: number; orderCount: number };

export async function getRevenueOverTime(
  granularity: DateGranularity,
  from?: string | null,
  to?: string | null
): Promise<RevenueBucket[]> {
  const { from: fromDate, to: toDate } = parseRange(from, to);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: CONFIRMED },
      createdAt: { gte: fromDate, lte: toDate },
    },
    select: { createdAt: true, totalPiastres: true },
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

  const map = new Map<string, { revenuePiastres: number; orderCount: number }>();
  for (const o of orders) {
    const key = formatKey(o.createdAt);
    const cur = map.get(key) ?? { revenuePiastres: 0, orderCount: 0 };
    cur.revenuePiastres += o.totalPiastres;
    cur.orderCount += 1;
    map.set(key, cur);
  }

  const result: RevenueBucket[] = [];
  for (const [period, v] of map.entries()) {
    result.push({ period, revenuePiastres: v.revenuePiastres, orderCount: v.orderCount });
  }
  result.sort((a, b) => a.period.localeCompare(b.period));
  return result;
}

export type BestSellerRow = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantitySold: number;
  revenuePiastres: number;
};

export async function getBestSellers(
  from?: string | null,
  to?: string | null,
  limit = 20
): Promise<BestSellerRow[]> {
  const { from: fromDate, to: toDate } = parseRange(from, to);

  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        status: { in: CONFIRMED },
        createdAt: { gte: fromDate, lte: toDate },
      },
    },
    select: {
      variantId: true,
      productName: true,
      variantName: true,
      sku: true,
      quantity: true,
      totalPiastres: true,
    },
  });

  const byVariant = new Map<
    string,
    { productName: string; variantName: string; sku: string; quantity: number; revenue: number }
  >();
  for (const i of items) {
    const cur = byVariant.get(i.variantId);
    if (cur) {
      cur.quantity += i.quantity;
      cur.revenue += i.totalPiastres;
    } else {
      byVariant.set(i.variantId, {
        productName: i.productName,
        variantName: i.variantName,
        sku: i.sku,
        quantity: i.quantity,
        revenue: i.totalPiastres,
      });
    }
  }

  return Array.from(byVariant.entries())
    .map(([variantId, v]) => ({
      variantId,
      productName: v.productName,
      variantName: v.variantName,
      sku: v.sku,
      quantitySold: v.quantity,
      revenuePiastres: v.revenue,
    }))
    .sort((a, b) => b.quantitySold - a.quantitySold)
    .slice(0, limit);
}

export type VariantPerformanceRow = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantitySold: number;
  revenuePiastres: number;
  stockAvailable: number;
  stockReserved: number;
};

export async function getVariantPerformance(
  from?: string | null,
  to?: string | null,
  limit = 50
): Promise<VariantPerformanceRow[]> {
  const { from: fromDate, to: toDate } = parseRange(from, to);

  const itemRows = await prisma.orderItem.findMany({
    where: {
      order: {
        status: { in: CONFIRMED },
        createdAt: { gte: fromDate, lte: toDate },
      },
    },
    select: { variantId: true, quantity: true, totalPiastres: true },
  });

  const soldMap = new Map<string, { quantity: number; revenue: number }>();
  for (const r of itemRows) {
    const cur = soldMap.get(r.variantId) ?? { quantity: 0, revenue: 0 };
    cur.quantity += r.quantity;
    cur.revenue += r.totalPiastres;
    soldMap.set(r.variantId, cur);
  }

  const variantIds = Array.from(soldMap.keys());
  const variants =
    variantIds.length === 0
      ? []
      : await prisma.variant.findMany({
          where: { id: { in: variantIds } },
          include: { product: { select: { name: true } } },
        });

  const rows: VariantPerformanceRow[] = variants.map((v) => {
    const sold = soldMap.get(v.id) ?? { quantity: 0, revenue: 0 };
    return {
      variantId: v.id,
      productName: v.product.name,
      variantName: v.name,
      sku: v.sku,
      quantitySold: sold.quantity,
      revenuePiastres: sold.revenue,
      stockAvailable: v.stockAvailable,
      stockReserved: v.stockReserved,
    };
  });
  rows.sort((a, b) => b.quantitySold - a.quantitySold);
  return rows.slice(0, limit);
}

export type LowStockRow = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  stockAvailable: number;
  stockReserved: number;
  threshold: number;
};

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export async function getLowStockAlerts(
  threshold: number = DEFAULT_LOW_STOCK_THRESHOLD
): Promise<LowStockRow[]> {
  const variants = await prisma.variant.findMany({
    where: { stockAvailable: { lte: threshold } },
    include: { product: { select: { name: true } } },
    orderBy: { stockAvailable: "asc" },
  });
  return variants.map((v) => ({
    variantId: v.id,
    productName: v.product.name,
    variantName: v.name,
    sku: v.sku,
    stockAvailable: v.stockAvailable,
    stockReserved: v.stockReserved,
    threshold,
  }));
}

export type CouponPerformanceRow = {
  couponId: string;
  code: string;
  discountType: string;
  discountValue: number;
  uses: number;
  maxUses: number | null;
  totalDiscountPiastres: number;
  orderCount: number;
};

export async function getCouponPerformance(
  from?: string | null,
  to?: string | null
): Promise<CouponPerformanceRow[]> {
  const { from: fromDate, to: toDate } = parseRange(from, to);

  const coupons = await prisma.coupon.findMany({
    include: {
      usages: {
        where: { usedAt: { gte: fromDate, lte: toDate } },
        include: { user: true },
      },
    },
  });

  const orderIdsByCoupon = new Map<string, Set<string>>();
  const discountByOrder = new Map<string, number>();
  const ordersInRange = await prisma.order.findMany({
    where: {
      status: { in: CONFIRMED },
      createdAt: { gte: fromDate, lte: toDate },
      couponCode: { not: null },
    },
    select: { id: true, couponCode: true, discountPiastres: true },
  });
  for (const o of ordersInRange) {
    if (o.couponCode) {
      discountByOrder.set(o.id, o.discountPiastres);
      const coupon = coupons.find((c) => c.code === o.couponCode);
      if (coupon) {
        let set = orderIdsByCoupon.get(coupon.id);
        if (!set) {
          set = new Set();
          orderIdsByCoupon.set(coupon.id, set);
        }
        set.add(o.id);
      }
    }
  }

  return coupons.map((c) => {
    const orderIds = orderIdsByCoupon.get(c.id) ?? new Set<string>();
    const totalDiscountPiastres = Array.from(orderIds).reduce(
      (sum, oid) => sum + (discountByOrder.get(oid) ?? 0),
      0
    );
    const usesInRange = c.usages.filter((u) => u.orderId && orderIds.has(u.orderId)).length;
    return {
      couponId: c.id,
      code: c.code,
      discountType: c.discountType,
      discountValue: c.discountValue,
      uses: c.usedCount,
      maxUses: c.maxUses,
      totalDiscountPiastres,
      orderCount: orderIds.size,
    };
  });
}

export type SeniorPromoRow = {
  orderId: string;
  userId: string;
  totalPiastres: number;
  seniorFreeValuePiastres: number;
  createdAt: Date;
};

export async function getSeniorPromoReport(
  from?: string | null,
  to?: string | null
): Promise<SeniorPromoRow[]> {
  const { from: fromDate, to: toDate } = parseRange(from, to);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: CONFIRMED },
      seniorFreeValuePiastres: { gt: 0 },
      createdAt: { gte: fromDate, lte: toDate },
    },
    select: {
      id: true,
      userId: true,
      totalPiastres: true,
      seniorFreeValuePiastres: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return orders;
}

export type ProviderPerformanceRow = {
  provider: string;
  orderCount: number;
  revenuePiastres: number;
};

export async function getProviderPerformance(
  from?: string | null,
  to?: string | null
): Promise<ProviderPerformanceRow[]> {
  const { from: fromDate, to: toDate } = parseRange(from, to);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: CONFIRMED },
      createdAt: { gte: fromDate, lte: toDate },
    },
    select: { shippingProvider: true, totalPiastres: true },
  });

  const byProvider = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    const cur = byProvider.get(o.shippingProvider) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += o.totalPiastres;
    byProvider.set(o.shippingProvider, cur);
  }
  return Array.from(byProvider.entries()).map(([provider, v]) => ({
    provider,
    orderCount: v.count,
    revenuePiastres: v.revenue,
  }));
}

export type PaymentMethodRow = {
  paymentMethod: string;
  orderCount: number;
  revenuePiastres: number;
};

export async function getPaymentMethodBreakdown(
  from?: string | null,
  to?: string | null
): Promise<PaymentMethodRow[]> {
  const { from: fromDate, to: toDate } = parseRange(from, to);

  const orders = await prisma.order.findMany({
    where: {
      status: { in: CONFIRMED },
      createdAt: { gte: fromDate, lte: toDate },
    },
    select: { paymentMethod: true, totalPiastres: true },
  });

  const byMethod = new Map<string, { count: number; revenue: number }>();
  for (const o of orders) {
    const cur = byMethod.get(o.paymentMethod) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += o.totalPiastres;
    byMethod.set(o.paymentMethod, cur);
  }
  return Array.from(byMethod.entries()).map(([paymentMethod, v]) => ({
    paymentMethod,
    orderCount: v.count,
    revenuePiastres: v.revenue,
  }));
}
