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
  attachPreviousAndDelta,
  computeDelta,
  formatComparisonLabel,
  isNetworkScope,
  periodToDateRange,
  resolvePeriod,
  type Delta,
  type PartnerReportResponse,
  type ReportAction,
  type ReportBreakdownPage,
  type ReportHeadline,
  type ReportScope,
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
  assignedPartnerId: string | null;
};

type OrderItemForSales = {
  orderId: string;
  variantId: string;
  quantity: number;
  totalPiastres: number;
  productName: string;
  variantName: string;
  assignedPartnerId: string | null;
};

function scopeWhere(scope: ReportScope) {
  return isNetworkScope(scope) ? { assignedPartnerId: { not: null } } : { assignedPartnerId: scope.partnerId };
}

async function loadOrders(scope: ReportScope, range: { from: Date; to: Date }): Promise<OrderForSales[]> {
  return prisma.order.findMany({
    where: { ...scopeWhere(scope), createdAt: { gte: range.from, lte: range.to } },
    select: {
      id: true,
      status: true,
      totalPiastres: true,
      paymentMethod: true,
      createdAt: true,
      shippingAddress: true,
      assignedPartnerId: true,
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
  /** 7.4 — previous-period revenue for the same key, computed over `period.previous`. */
  previousRevenuePiastres: number;
  revenueDelta: Delta;
};

/** Backlog 9.6 (a) — network scope's first breakdown key: one row per partner. `null` for
 * the partner-scoped form (nothing to break down by). */
export type PartnerBreakdownRow = SimpleBreakdownRow & { cancellationRatePct: number };

export type SalesReportBreakdowns = {
  byPartner: ReportBreakdownPage<PartnerBreakdownRow> | null;
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
  scope: ReportScope,
  input: { preset: SalesReportPreset; from?: string; to?: string },
  key: keyof SalesReportBreakdowns
): Promise<unknown[]> {
  const period = resolvePeriod(input);
  const [currentOrders, previousOrders, currentItems, previousItems] = await Promise.all([
    loadOrders(scope, periodToDateRange(period.current)),
    loadOrders(scope, periodToDateRange(period.previous)),
    loadOrderItems(scope, periodToDateRange(period.current)),
    loadOrderItems(scope, periodToDateRange(period.previous)),
  ]);
  const full = await buildFullBreakdowns(scope, currentOrders, previousOrders, currentItems, previousItems);
  return full[key] ?? [];
}

function paginate<T>(rows: T[], page: number): ReportBreakdownPage<T> {
  const start = (page - 1) * PAGE_SIZE;
  return { rows: rows.slice(start, start + PAGE_SIZE), page, pageSize: PAGE_SIZE, total: rows.length };
}

export async function getPartnerSalesReport(
  scope: ReportScope,
  input: { preset: SalesReportPreset; from?: string; to?: string; page?: number }
): Promise<SalesReportResponse> {
  const period = resolvePeriod(input);
  const page = Math.max(1, input.page ?? 1);

  const [currentOrders, previousOrders, currentItems, previousItems] = await Promise.all([
    loadOrders(scope, periodToDateRange(period.current)),
    loadOrders(scope, periodToDateRange(period.previous)),
    loadOrderItems(scope, periodToDateRange(period.current)),
    loadOrderItems(scope, periodToDateRange(period.previous)),
  ]);

  const headline = buildHeadline(currentOrders, previousOrders, currentItems, previousItems);
  const series = buildSeries(currentOrders, previousOrders, period);
  const full = await buildFullBreakdowns(scope, currentOrders, previousOrders, currentItems, previousItems);
  const breakdowns: SalesReportBreakdowns = {
    byPartner: full.byPartner ? paginate(full.byPartner, page) : null,
    product: paginate(full.product, page),
    category: paginate(full.category, page),
    governorate: paginate(full.governorate, page),
    payment: paginate(full.payment, page),
    day: paginate(full.day, page),
  };
  const actions = isNetworkScope(scope) ? [] : await buildActions(scope.partnerId, currentOrders, full);

  return {
    period,
    comparisonLabel: formatComparisonLabel(period, (iso) => formatDateEn(iso)),
    headline,
    series,
    breakdowns,
    actions,
  };
}

async function loadOrderItems(scope: ReportScope, range: { from: Date; to: Date }): Promise<OrderItemForSales[]> {
  const items = await prisma.orderItem.findMany({
    where: {
      order: { ...scopeWhere(scope), status: "DELIVERED", createdAt: { gte: range.from, lte: range.to } },
    },
    select: {
      orderId: true,
      variantId: true,
      quantity: true,
      totalPiastres: true,
      productName: true,
      variantName: true,
      order: { select: { assignedPartnerId: true } },
    },
  });
  return items.map((it) => ({ ...it, assignedPartnerId: it.order.assignedPartnerId }));
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
    { key: "revenue", label: "الإيراد", value: curRevenue, previous: prevRevenue, delta: computeDelta(curRevenue, prevRevenue), unit: "piastres", hint: "طلبات تم تسليمها فقط" },
    { key: "orders", label: "الطلبات", value: curOrderCount, previous: prevOrderCount, delta: computeDelta(curOrderCount, prevOrderCount), unit: "count", hint: "كل الحالات" },
    { key: "units", label: "القطع", value: curUnits, previous: prevUnits, delta: computeDelta(curUnits, prevUnits), unit: "count", hint: "طلبات تم تسليمها فقط" },
    { key: "averageOrder", label: "متوسط الطلب", value: Math.round(curAvg), previous: Math.round(prevAvg), delta: computeDelta(curAvg, prevAvg), unit: "piastres", hint: "طلبات تم تسليمها فقط" },
    { key: "cancellationRate", label: "نسبة الإلغاء", value: curCancelRate, previous: prevCancelRate, delta: computeDelta(curCancelRate, prevCancelRate), unit: "percent", hint: "من كل الطلبات" },
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
  byPartner: PartnerBreakdownRow[] | null;
  product: ProductBreakdownRow[];
  category: SimpleBreakdownRow[];
  governorate: (SimpleBreakdownRow & { cancellationRatePct: number })[];
  payment: SimpleBreakdownRow[];
  day: { date: string; revenuePiastres: number; orderCount: number }[];
};

/** Base row shape before the 7.4 previous-period delta is attached. */
type BaseSimpleRow = { key: string; label: string; units: number; revenuePiastres: number; orderCount: number };

/**
 * Pure (7.4): revenue-per-key rows keyed on `key`, plus the previous-period revenue for the
 * same key (0 when the key has no previous-period row — never invented). Shared by the
 * category, governorate and payment breakdowns, which only differ in how their base rows and
 * previous-period revenue maps are aggregated.
 */
export function attachRevenueDelta(rows: BaseSimpleRow[], previousRevenueByKey: Map<string, number>): SimpleBreakdownRow[] {
  return attachPreviousAndDelta(rows, (r) => r.key, (r) => r.revenuePiastres, previousRevenueByKey, {
    previousKey: "previousRevenuePiastres",
    deltaKey: "revenueDelta",
  });
}

async function buildFullBreakdowns(
  scope: ReportScope,
  currentOrders: OrderForSales[],
  previousOrders: OrderForSales[],
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

  // --- category (via variant -> product -> category); the variant lookup covers both
  // periods' variant ids, since a variant that only sold in the previous period still needs
  // its category resolved to land in that category's previous-revenue map. ---
  const variantIds = Array.from(curByVariant.keys());
  const prevVariantIds = Array.from(new Set(previousItems.map((it) => it.variantId)));
  const allVariantIdsForCategory = Array.from(new Set([...variantIds, ...prevVariantIds]));
  const variants = allVariantIdsForCategory.length
    ? await prisma.variant.findMany({
        where: { id: { in: allVariantIdsForCategory } },
        select: { id: true, product: { select: { category: { select: { id: true, name: true } } } } },
      })
    : [];
  const categoryByVariant = new Map(variants.map((v) => [v.id, v.product.category]));
  const categoryMap = new Map<string, BaseSimpleRow>();
  for (const [variantId, row] of curByVariant) {
    const cat = categoryByVariant.get(variantId);
    const key = cat?.id ?? "uncategorised";
    const label = cat?.name ?? "غير مصنف";
    const existing = categoryMap.get(key) ?? { key, label, units: 0, revenuePiastres: 0, orderCount: 0 };
    existing.units += row.units;
    existing.revenuePiastres += row.revenue;
    categoryMap.set(key, existing);
  }
  const prevCategoryRevenue = new Map<string, number>();
  for (const it of previousItems) {
    const cat = categoryByVariant.get(it.variantId);
    const key = cat?.id ?? "uncategorised";
    prevCategoryRevenue.set(key, (prevCategoryRevenue.get(key) ?? 0) + it.totalPiastres);
  }
  const categoryRows = attachRevenueDelta(
    Array.from(categoryMap.values()).sort((a, b) => b.revenuePiastres - a.revenuePiastres),
    prevCategoryRevenue
  );

  // --- governorate ---
  const deliveredOrders = currentOrders.filter((o) => o.status === "DELIVERED");
  const prevDeliveredOrders = previousOrders.filter((o) => o.status === "DELIVERED");
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
  const prevGovRevenue = new Map<string, number>();
  for (const o of prevDeliveredOrders) {
    const gov = governorateOf(o);
    prevGovRevenue.set(gov, (prevGovRevenue.get(gov) ?? 0) + o.totalPiastres);
  }
  const governorateBaseRows = Array.from(govMap.entries())
    .map((entry) => {
      const [gov, row] = entry;
      return {
        key: gov,
        label: gov,
        units: 0,
        revenuePiastres: row.revenue,
        orderCount: row.orders,
        cancellationRatePct: row.total > 0 ? (row.cancelled / row.total) * 100 : 0,
      };
    })
    .sort((a, b) => b.revenuePiastres - a.revenuePiastres);
  // `attachRevenueDelta` spreads each input row before adding the delta fields, so
  // `cancellationRatePct` survives at runtime even though `BaseSimpleRow` doesn't declare it.
  const governorateRows = attachRevenueDelta(governorateBaseRows, prevGovRevenue) as (SimpleBreakdownRow & {
    cancellationRatePct: number;
  })[];

  // --- payment method ---
  const paymentMap = new Map<string, BaseSimpleRow>();
  for (const o of deliveredOrders) {
    const key = o.paymentMethod;
    const row = paymentMap.get(key) ?? { key, label: key, units: 0, revenuePiastres: 0, orderCount: 0 };
    row.revenuePiastres += o.totalPiastres;
    row.orderCount += 1;
    paymentMap.set(key, row);
  }
  const prevPaymentRevenue = new Map<string, number>();
  for (const o of prevDeliveredOrders) {
    prevPaymentRevenue.set(o.paymentMethod, (prevPaymentRevenue.get(o.paymentMethod) ?? 0) + o.totalPiastres);
  }
  const paymentRows = attachRevenueDelta(
    Array.from(paymentMap.values()).sort((a, b) => b.revenuePiastres - a.revenuePiastres),
    prevPaymentRevenue
  );

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

  // --- byPartner (backlog 9.6 (a)) — network scope only; one row per partner that owns at
  // least one order in the current period, same shape as the other simple breakdowns. ---
  let byPartner: PartnerBreakdownRow[] | null = null;
  if (isNetworkScope(scope)) {
    const partnerMap = new Map<string, { revenue: number; orders: number; cancelled: number; total: number }>();
    for (const o of currentOrders) {
      const key = o.assignedPartnerId ?? "unassigned";
      const row = partnerMap.get(key) ?? { revenue: 0, orders: 0, cancelled: 0, total: 0 };
      row.total += 1;
      if (o.status === "CANCELLED") row.cancelled += 1;
      if (o.status === "DELIVERED") {
        row.revenue += o.totalPiastres;
        row.orders += 1;
      }
      partnerMap.set(key, row);
    }
    const prevPartnerRevenue = new Map<string, number>();
    for (const o of prevDeliveredOrders) {
      const key = o.assignedPartnerId ?? "unassigned";
      prevPartnerRevenue.set(key, (prevPartnerRevenue.get(key) ?? 0) + o.totalPiastres);
    }
    const partnerIds = Array.from(partnerMap.keys()).filter((k) => k !== "unassigned");
    const partners = partnerIds.length
      ? await prisma.partner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, name: true } })
      : [];
    const nameById = new Map(partners.map((p) => [p.id, p.name]));
    const baseRows = Array.from(partnerMap.entries())
      .map(([key, row]) => ({
        key,
        label: key === "unassigned" ? "بلا شريك" : (nameById.get(key) ?? key),
        units: 0,
        revenuePiastres: row.revenue,
        orderCount: row.orders,
        cancellationRatePct: row.total > 0 ? (row.cancelled / row.total) * 100 : 0,
      }))
      .sort((a, b) => b.revenuePiastres - a.revenuePiastres);
    byPartner = attachRevenueDelta(baseRows, prevPartnerRevenue) as PartnerBreakdownRow[];
  }

  return {
    byPartner,
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
