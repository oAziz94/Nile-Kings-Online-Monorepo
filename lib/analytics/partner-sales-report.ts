/**
 * Sales report (backlog 5.6a) — `GET /api/partner/reports/sales`. Headline numbers use two
 * deliberately different universes, documented here since it's easy to conflate:
 *  - `orders` and `cancellationRate` count every order assigned to the partner and created
 *    in the period, whatever its current status (the whole funnel, including still-open and
 *    cancelled orders — this is what makes a cancellation rate meaningful at all).
 *  - `revenue`, `units` and `averageOrder` only count `DELIVERED` orders (completed, paid-out
 *    business) — the same trust signal the v1 report's "تم التسليم فقط" badge encoded,
 *    carried over into the new headline shape rather than a separate badge.
 * Breakdowns (product/category/governorate/payment/day) are computed over the same
 * DELIVERED universe as revenue, since they exist to explain where that revenue came from.
 */
import { prisma } from "@/lib/db";
import { resolveThreshold } from "@/lib/partner/resolve-threshold";
import {
  computeDelta,
  formatComparisonLabel,
  periodToDateRange,
  resolvePeriod,
  type PartnerReportResponse,
  type ReportAction,
  type ReportBreakdownPage,
  type ReportHeadline,
  type ReportSeries,
  type ResolvedPeriod,
  type SalesReportPreset,
} from "./partner-reports";
import { formatDateEn } from "@/lib/format-en-numbers";

type OrderForSales = {
  id: string;
  status: string;
  totalPiastres: number;
  paymentMethod: string;
  createdAt: Date;
  shippingAddress: unknown;
};

type OrderItemForSales = {
  orderId: string;
  variantId: string;
  quantity: number;
  totalPiastres: number;
  productName: string;
  variantName: string;
};

async function loadOrders(partnerId: string, range: { from: Date; to: Date }): Promise<OrderForSales[]> {
  return prisma.order.findMany({
    where: { assignedPartnerId: partnerId, createdAt: { gte: range.from, lte: range.to } },
    select: {
      id: true,
      status: true,
      totalPiastres: true,
      paymentMethod: true,
      createdAt: true,
      shippingAddress: true,
    },
  });
}

function governorateOf(order: { shippingAddress: unknown }): string {
  const addr = order.shippingAddress as { governorate?: string } | null;
  return addr?.governorate?.trim() || "غير محدد";
}

export type ProductBreakdownRow = {
  variantId: string;
  productName: string;
  units: number;
  revenuePiastres: number;
  previousRevenuePiastres: number;
  revenueSharePct: number;
};

export type SimpleBreakdownRow = {
  key: string;
  label: string;
  units: number;
  revenuePiastres: number;
  orderCount: number;
};

export type SalesReportBreakdowns = {
  product: ReportBreakdownPage<ProductBreakdownRow>;
  category: ReportBreakdownPage<SimpleBreakdownRow>;
  governorate: ReportBreakdownPage<SimpleBreakdownRow & { cancellationRatePct: number }>;
  payment: ReportBreakdownPage<SimpleBreakdownRow>;
  day: ReportBreakdownPage<{ date: string; revenuePiastres: number; orderCount: number }>;
};

export type SalesReportResponse = PartnerReportResponse<SalesReportBreakdowns>;

const PAGE_SIZE = 25;

/**
 * The full (unpaginated) breakdown rows for one family — used by the CSV export, which
 * "streams the whole set" regardless of the table's own page size (backlog 5.6a).
 */
export async function getPartnerSalesFullBreakdown(
  partnerId: string,
  input: { preset: SalesReportPreset; from?: string; to?: string },
  key: keyof SalesReportBreakdowns
): Promise<unknown[]> {
  const period = resolvePeriod(input);
  const [currentOrders, currentItems, previousItems] = await Promise.all([
    loadOrders(partnerId, periodToDateRange(period.current)),
    loadOrderItems(partnerId, periodToDateRange(period.current)),
    loadOrderItems(partnerId, periodToDateRange(period.previous)),
  ]);
  const full = await buildFullBreakdowns(currentOrders, currentItems, previousItems);
  return full[key];
}

function paginate<T>(rows: T[], page: number): ReportBreakdownPage<T> {
  const start = (page - 1) * PAGE_SIZE;
  return { rows: rows.slice(start, start + PAGE_SIZE), page, pageSize: PAGE_SIZE, total: rows.length };
}

export async function getPartnerSalesReport(
  partnerId: string,
  input: { preset: SalesReportPreset; from?: string; to?: string; page?: number }
): Promise<SalesReportResponse> {
  const period = resolvePeriod(input);
  const page = Math.max(1, input.page ?? 1);

  const [currentOrders, previousOrders, currentItems, previousItems] = await Promise.all([
    loadOrders(partnerId, periodToDateRange(period.current)),
    loadOrders(partnerId, periodToDateRange(period.previous)),
    loadOrderItems(partnerId, periodToDateRange(period.current)),
    loadOrderItems(partnerId, periodToDateRange(period.previous)),
  ]);

  const headline = buildHeadline(currentOrders, previousOrders, currentItems, previousItems);
  const series = buildSeries(currentOrders, previousOrders, period);
  const full = await buildFullBreakdowns(currentOrders, currentItems, previousItems);
  const breakdowns: SalesReportBreakdowns = {
    product: paginate(full.product, page),
    category: paginate(full.category, page),
    governorate: paginate(full.governorate, page),
    payment: paginate(full.payment, page),
    day: paginate(full.day, page),
  };
  const actions = await buildActions(partnerId, currentOrders, full);

  return {
    period,
    comparisonLabel: formatComparisonLabel(period, (iso) => formatDateEn(iso)),
    headline,
    series,
    breakdowns,
    actions,
  };
}

async function loadOrderItems(partnerId: string, range: { from: Date; to: Date }): Promise<OrderItemForSales[]> {
  const items = await prisma.orderItem.findMany({
    where: {
      order: { assignedPartnerId: partnerId, status: "DELIVERED", createdAt: { gte: range.from, lte: range.to } },
    },
    select: {
      orderId: true,
      variantId: true,
      quantity: true,
      totalPiastres: true,
      productName: true,
      variantName: true,
    },
  });
  return items;
}

function buildHeadline(
  currentOrders: OrderForSales[],
  previousOrders: OrderForSales[],
  currentItems: OrderItemForSales[],
  previousItems: OrderItemForSales[]
): ReportHeadline[] {
  const delivered = (orders: OrderForSales[]) => orders.filter((o) => o.status === "DELIVERED");
  const cancelled = (orders: OrderForSales[]) => orders.filter((o) => o.status === "CANCELLED");

  const curDelivered = delivered(currentOrders);
  const prevDelivered = delivered(previousOrders);

  const curRevenue = curDelivered.reduce((s, o) => s + o.totalPiastres, 0);
  const prevRevenue = prevDelivered.reduce((s, o) => s + o.totalPiastres, 0);

  const curUnits = currentItems.reduce((s, i) => s + i.quantity, 0);
  const prevUnits = previousItems.reduce((s, i) => s + i.quantity, 0);

  const curAvg = curDelivered.length > 0 ? curRevenue / curDelivered.length : 0;
  const prevAvg = prevDelivered.length > 0 ? prevRevenue / prevDelivered.length : 0;

  const curOrderCount = currentOrders.length;
  const prevOrderCount = previousOrders.length;

  const curCancelRate = curOrderCount > 0 ? (cancelled(currentOrders).length / curOrderCount) * 100 : 0;
  const prevCancelRate = prevOrderCount > 0 ? (cancelled(previousOrders).length / prevOrderCount) * 100 : 0;

  return [
    { key: "revenue", label: "الإيراد", value: curRevenue, previous: prevRevenue, delta: computeDelta(curRevenue, prevRevenue), unit: "piastres" },
    { key: "orders", label: "الطلبات", value: curOrderCount, previous: prevOrderCount, delta: computeDelta(curOrderCount, prevOrderCount), unit: "count" },
    { key: "units", label: "القطع", value: curUnits, previous: prevUnits, delta: computeDelta(curUnits, prevUnits), unit: "count" },
    { key: "averageOrder", label: "متوسط الطلب", value: Math.round(curAvg), previous: Math.round(prevAvg), delta: computeDelta(curAvg, prevAvg), unit: "piastres" },
    { key: "cancellationRate", label: "نسبة الإلغاء", value: curCancelRate, previous: prevCancelRate, delta: computeDelta(curCancelRate, prevCancelRate), unit: "percent" },
  ];
}

function buildSeries(currentOrders: OrderForSales[], previousOrders: OrderForSales[], period: ResolvedPeriod): ReportSeries[] {
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const bucket = (orders: OrderForSales[]) => {
    const map = new Map<string, number>();
    for (const o of orders) {
      if (o.status !== "DELIVERED") continue;
      const key = dayKey(o.createdAt);
      map.set(key, (map.get(key) ?? 0) + o.totalPiastres);
    }
    return map;
  };
  const curMap = bucket(currentOrders);
  const prevMap = bucket(previousOrders);

  const points: { x: string; y: number }[] = [];
  const previousPoints: { x: string; y: number }[] = [];
  for (let i = 0; i < period.days; i++) {
    const curDate = addDaysToIso(period.current.from, i);
    const prevDate = addDaysToIso(period.previous.from, i);
    points.push({ x: curDate, y: curMap.get(curDate) ?? 0 });
    previousPoints.push({ x: curDate, y: prevMap.get(prevDate) ?? 0 });
  }

  return [{ key: "revenue", label: "الإيراد اليومي", points, previousPoints }];
}

function addDaysToIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type FullBreakdowns = {
  product: ProductBreakdownRow[];
  category: SimpleBreakdownRow[];
  governorate: (SimpleBreakdownRow & { cancellationRatePct: number })[];
  payment: SimpleBreakdownRow[];
  day: { date: string; revenuePiastres: number; orderCount: number }[];
};

async function buildFullBreakdowns(
  currentOrders: OrderForSales[],
  currentItems: OrderItemForSales[],
  previousItems: OrderItemForSales[]
): Promise<FullBreakdowns> {
  const totalRevenue = currentOrders.filter((o) => o.status === "DELIVERED").reduce((s, o) => s + o.totalPiastres, 0);

  // --- product ---
  const curByVariant = new Map<string, { units: number; revenue: number; productName: string }>();
  for (const it of currentItems) {
    const row = curByVariant.get(it.variantId) ?? { units: 0, revenue: 0, productName: it.productName };
    row.units += it.quantity;
    row.revenue += it.totalPiastres;
    curByVariant.set(it.variantId, row);
  }
  const prevByVariant = new Map<string, number>();
  for (const it of previousItems) {
    prevByVariant.set(it.variantId, (prevByVariant.get(it.variantId) ?? 0) + it.totalPiastres);
  }
  const productRows: ProductBreakdownRow[] = Array.from(curByVariant.entries())
    .map(([variantId, row]) => ({
      variantId,
      productName: row.productName,
      units: row.units,
      revenuePiastres: row.revenue,
      previousRevenuePiastres: prevByVariant.get(variantId) ?? 0,
      revenueSharePct: totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenuePiastres - a.revenuePiastres);

  // --- category (via variant -> product -> category) ---
  const variantIds = Array.from(curByVariant.keys());
  const variants = variantIds.length
    ? await prisma.variant.findMany({
        where: { id: { in: variantIds } },
        select: { id: true, product: { select: { category: { select: { id: true, name: true } } } } },
      })
    : [];
  const categoryByVariant = new Map(variants.map((v) => [v.id, v.product.category]));
  const categoryMap = new Map<string, SimpleBreakdownRow>();
  for (const [variantId, row] of curByVariant) {
    const cat = categoryByVariant.get(variantId);
    const key = cat?.id ?? "uncategorised";
    const label = cat?.name ?? "غير مصنف";
    const existing = categoryMap.get(key) ?? { key, label, units: 0, revenuePiastres: 0, orderCount: 0 };
    existing.units += row.units;
    existing.revenuePiastres += row.revenue;
    categoryMap.set(key, existing);
  }
  const categoryRows = Array.from(categoryMap.values()).sort((a, b) => b.revenuePiastres - a.revenuePiastres);

  // --- governorate ---
  const deliveredOrders = currentOrders.filter((o) => o.status === "DELIVERED");
  const govMap = new Map<string, { revenue: number; orders: number; cancelled: number; total: number }>();
  for (const o of currentOrders) {
    const gov = governorateOf(o);
    const row = govMap.get(gov) ?? { revenue: 0, orders: 0, cancelled: 0, total: 0 };
    row.total += 1;
    if (o.status === "CANCELLED") row.cancelled += 1;
    govMap.set(gov, row);
  }
  for (const o of deliveredOrders) {
    const gov = governorateOf(o);
    const row = govMap.get(gov)!;
    row.revenue += o.totalPiastres;
    row.orders += 1;
  }
  const governorateRows = Array.from(govMap.entries())
    .map(([gov, row]) => ({
      key: gov,
      label: gov,
      units: 0,
      revenuePiastres: row.revenue,
      orderCount: row.orders,
      cancellationRatePct: row.total > 0 ? (row.cancelled / row.total) * 100 : 0,
    }))
    .sort((a, b) => b.revenuePiastres - a.revenuePiastres);

  // --- payment method ---
  const paymentMap = new Map<string, SimpleBreakdownRow>();
  for (const o of deliveredOrders) {
    const key = o.paymentMethod;
    const row = paymentMap.get(key) ?? { key, label: key, units: 0, revenuePiastres: 0, orderCount: 0 };
    row.revenuePiastres += o.totalPiastres;
    row.orderCount += 1;
    paymentMap.set(key, row);
  }
  const paymentRows = Array.from(paymentMap.values()).sort((a, b) => b.revenuePiastres - a.revenuePiastres);

  // --- day ---
  const dayMap = new Map<string, { revenue: number; orders: number }>();
  for (const o of deliveredOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const row = dayMap.get(key) ?? { revenue: 0, orders: 0 };
    row.revenue += o.totalPiastres;
    row.orders += 1;
    dayMap.set(key, row);
  }
  const dayRows = Array.from(dayMap.entries())
    .map(([date, row]) => ({ date, revenuePiastres: row.revenue, orderCount: row.orders }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    product: productRows,
    category: categoryRows,
    governorate: governorateRows,
    payment: paymentRows,
    day: dayRows,
  };
}

async function buildActions(
  partnerId: string,
  currentOrders: OrderForSales[],
  breakdowns: FullBreakdowns
): Promise<ReportAction[]> {
  const actions: ReportAction[] = [];

  // Top sellers under threshold -> stock.
  const topVariantIds = breakdowns.product.slice(0, 10).map((r) => r.variantId);
  if (topVariantIds.length > 0) {
    const [threshold, inventories] = await Promise.all([
      resolveThreshold(partnerId),
      prisma.partnerInventory.findMany({
        where: { partnerId, variantId: { in: topVariantIds } },
        select: {
          variantId: true,
          stockAvailable: true,
          stockReserved: true,
          variant: { select: { productId: true, product: { select: { categoryId: true } } } },
        },
      }),
    ]);
    const underThreshold = inventories.filter((inv) => {
      const sellable = inv.stockAvailable - inv.stockReserved;
      const t = threshold.forVariant({ productId: inv.variant.productId, categoryId: inv.variant.product.categoryId });
      return sellable <= t;
    });
    if (underThreshold.length > 0) {
      actions.push({
        label: `${underThreshold.length} من أفضل الأصناف مبيعًا تحت حد التنبيه`,
        href: "/partner/stock",
      });
    }
  }

  // Governorate cancellation rate >= 2x the partner's average -> pipeline filter.
  const totalOrders = currentOrders.length;
  const totalCancelled = currentOrders.filter((o) => o.status === "CANCELLED").length;
  const avgCancelRate = totalOrders > 0 ? (totalCancelled / totalOrders) * 100 : 0;
  const worstGov =
    avgCancelRate > 0 ? breakdowns.governorate.find((g) => g.cancellationRatePct >= avgCancelRate * 2) : undefined;
  if (worstGov) {
    actions.push({
      label: `نسبة الإلغاء في ${worstGov.label} ${worstGov.cancellationRatePct.toFixed(0)}% — ضعف المتوسط`,
      href: `/partner/orders?governorate=${encodeURIComponent(worstGov.label)}`,
    });
  }

  return actions;
}
