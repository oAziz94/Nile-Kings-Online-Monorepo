/**
 * Sales report (backlog 5.6a) — `GET /api/partner/reports/sales`. Backlog 10.13 replaced the
 * old hardcoded DELIVERED-only headline with an owner-chosen **order set** the caller picks
 * via `orders=accomplished|active` (default `accomplished`):
 *  - `accomplished` = `DELIVERED` only (completed, paid-out business — the same trust signal
 *    the v1 report's "تم التسليم فقط" badge encoded).
 *  - `active` = `CONFIRMED`, `PROCESSING`, `READY_TO_SHIP`, `SHIPPED` (still in flight, not yet
 *    delivered, not cancelled).
 *  - Unpaid `CREATED` and `CANCELLED` orders are in neither set.
 * The chosen set drives every tile and breakdown **except** `cancellationRate`, which stays
 * cancelled ÷ every order created in the period regardless of the filter (a funnel number).
 * Revenue is **net merchandise** (`netMerchandisePiastres` — subtotal − discount − senior free
 * value), never `Order.totalPiastres` (which also carries shipping + the COD fee) — the same
 * basis the money report already uses.
 */
import { prisma } from "@/lib/db";
import type { OrderStatus, Prisma } from "@prisma/client";
import { resolveThreshold } from "@/lib/partner/resolve-threshold";
import { netMerchandisePiastres } from "./queries";
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

/** Backlog 10.13 — the two order sets a sales report can be scoped to. */
export type SalesOrderSet = "accomplished" | "active";

export const ACCOMPLISHED_STATUSES: OrderStatus[] = ["DELIVERED"];
export const ACTIVE_STATUSES: OrderStatus[] = ["CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED"];

/** `OrderForSales.status` is a plain `string` (loaded via `select`, not the enum type), so
 * this returns `string[]` for `.includes()` checks against it; `orderStatusesForPrismaFilter`
 * below returns the enum-typed array Prisma's `in` filter needs. */
export function statusesForOrderSet(orderSet: SalesOrderSet): string[] {
  return orderSet === "active" ? ACTIVE_STATUSES : ACCOMPLISHED_STATUSES;
}

/** Exported (10.13) so `buildHeadline` is unit-testable against hand-built fixture orders. */
export type OrderForSales = {
  id: string;
  status: string;
  totalPiastres: number;
  subtotalPiastres: number;
  discountPiastres: number;
  seniorFreeValuePiastres: number;
  paymentMethod: string;
  createdAt: Date;
  shippingAddress: unknown;
  assignedPartnerId: string | null;
};

export type OrderItemForSales = {
  orderId: string;
  variantId: string;
  quantity: number;
  totalPiastres: number;
  productName: string;
  variantName: string;
  assignedPartnerId: string | null;
};

/** Explicit `Prisma.OrderWhereInput` return type (10.13) — an inferred union type here made
 * TS mis-resolve the `where.order` overload once `loadOrderItems` gained a second filter
 * (`status: { in: [...] }`) spread alongside it; a concrete type keeps the merge a single shape. */
function scopeWhere(scope: ReportScope): Prisma.OrderWhereInput {
  return isNetworkScope(scope) ? { assignedPartnerId: { not: null } } : { assignedPartnerId: scope.partnerId };
}

async function loadOrders(scope: ReportScope, range: { from: Date; to: Date }): Promise<OrderForSales[]> {
  return prisma.order.findMany({
    where: { ...scopeWhere(scope), createdAt: { gte: range.from, lte: range.to } },
    select: {
      id: true,
      status: true,
      totalPiastres: true,
      subtotalPiastres: true,
      discountPiastres: true,
      seniorFreeValuePiastres: true,
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
  /** 10.17 — one row per product (`Product.id`), not per variant: the row sums every sold
   * variant of the product. `productId` falls back to a variant's own id only when the
   * variant's product could not be resolved (deleted product) — keeps such a row from
   * merging with an unrelated product that happens to share no id. */
  productId: string;
  productName: string;
  /** 10.16 — the product's slug, for the identifier line under the name. `null` only if the
   * product could not be resolved (deleted). */
  productSlug: string | null;
  units: number;
  revenuePiastres: number;
  previousRevenuePiastres: number;
  revenueSharePct: number;
  /** 10.17 — distinct orders containing at least one of the product's variants (not a sum
   * of each variant's own order count — an order with two sizes of the same product counts
   * once). */
  orderCount: number;
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
  input: { preset: SalesReportPreset; from?: string; to?: string; orderSet?: SalesOrderSet },
  key: keyof SalesReportBreakdowns
): Promise<unknown[]> {
  const orderSet = input.orderSet ?? "accomplished";
  const period = resolvePeriod(input);
  const [currentOrders, previousOrders, currentItems, previousItems] = await Promise.all([
    loadOrders(scope, periodToDateRange(period.current)),
    loadOrders(scope, periodToDateRange(period.previous)),
    loadOrderItems(scope, periodToDateRange(period.current), orderSet),
    loadOrderItems(scope, periodToDateRange(period.previous), orderSet),
  ]);
  const full = await buildFullBreakdowns(scope, currentOrders, previousOrders, currentItems, previousItems, orderSet);
  return full[key] ?? [];
}

function paginate<T>(rows: T[], page: number, all?: boolean): ReportBreakdownPage<T> {
  if (all) return { rows, page: 1, pageSize: rows.length, total: rows.length };
  const start = (page - 1) * PAGE_SIZE;
  return { rows: rows.slice(start, start + PAGE_SIZE), page, pageSize: PAGE_SIZE, total: rows.length };
}

export async function getPartnerSalesReport(
  scope: ReportScope,
  input: {
    preset: SalesReportPreset;
    from?: string;
    to?: string;
    page?: number;
    orderSet?: SalesOrderSet;
    /** Backlog 10.14 — the print page needs every row of every table, not page 1 (the print
     * document has no pagination control); every breakdown is returned as one unpaginated
     * page instead of re-deriving the numbers a second way. */
    all?: boolean;
  }
): Promise<SalesReportResponse> {
  const orderSet = input.orderSet ?? "accomplished";
  const period = resolvePeriod(input);
  const page = Math.max(1, input.page ?? 1);

  const [currentOrders, previousOrders, currentItems, previousItems] = await Promise.all([
    loadOrders(scope, periodToDateRange(period.current)),
    loadOrders(scope, periodToDateRange(period.previous)),
    loadOrderItems(scope, periodToDateRange(period.current), orderSet),
    loadOrderItems(scope, periodToDateRange(period.previous), orderSet),
  ]);

  const headline = buildHeadline(currentOrders, previousOrders, currentItems, previousItems, orderSet);
  const series = buildSeries(currentOrders, previousOrders, period, orderSet);
  const full = await buildFullBreakdowns(scope, currentOrders, previousOrders, currentItems, previousItems, orderSet);
  const breakdowns: SalesReportBreakdowns = {
    byPartner: full.byPartner ? paginate(full.byPartner, page, input.all) : null,
    product: paginate(full.product, page, input.all),
    category: paginate(full.category, page, input.all),
    governorate: paginate(full.governorate, page, input.all),
    payment: paginate(full.payment, page, input.all),
    day: paginate(full.day, page, input.all),
  };
  const actions = isNetworkScope(scope) ? [] : await buildActions(scope.partnerId, currentOrders, currentItems, full);

  return {
    period,
    comparisonLabel: formatComparisonLabel(period, (iso) => formatDateEn(iso)),
    headline,
    series,
    breakdowns,
    actions,
  };
}

async function loadOrderItems(
  scope: ReportScope,
  range: { from: Date; to: Date },
  orderSet: SalesOrderSet
): Promise<OrderItemForSales[]> {
  const items = await prisma.orderItem.findMany({
    where: {
      order: {
        ...scopeWhere(scope),
        status: { in: orderSet === "active" ? ACTIVE_STATUSES : ACCOMPLISHED_STATUSES },
        createdAt: { gte: range.from, lte: range.to },
      },
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

/** Exported (10.13) for a database-free unit test against fixture orders. */
export function buildHeadline(
  currentOrders: OrderForSales[],
  previousOrders: OrderForSales[],
  currentItems: OrderItemForSales[],
  previousItems: OrderItemForSales[],
  orderSet: SalesOrderSet
): ReportHeadline[] {
  const statuses = statusesForOrderSet(orderSet);
  const inSet = (orders: OrderForSales[]) => orders.filter((o) => statuses.includes(o.status));
  const cancelled = (orders: OrderForSales[]) => orders.filter((o) => o.status === "CANCELLED");

  const curSet = inSet(currentOrders);
  const prevSet = inSet(previousOrders);

  const curRevenue = curSet.reduce((s, o) => s + netMerchandisePiastres(o), 0);
  const prevRevenue = prevSet.reduce((s, o) => s + netMerchandisePiastres(o), 0);

  const curUnits = currentItems.reduce((s, i) => s + i.quantity, 0);
  const prevUnits = previousItems.reduce((s, i) => s + i.quantity, 0);

  const curAvg = curSet.length > 0 ? curRevenue / curSet.length : 0;
  const prevAvg = prevSet.length > 0 ? prevRevenue / prevSet.length : 0;

  const curOrderCount = curSet.length;
  const prevOrderCount = prevSet.length;

  // نسبة الإلغاء stays as today (10.13): cancelled ÷ every order created in the period,
  // whatever the chosen set — a funnel number, not scoped by the filter.
  const curCancelRate = currentOrders.length > 0 ? (cancelled(currentOrders).length / currentOrders.length) * 100 : 0;
  const prevCancelRate = previousOrders.length > 0 ? (cancelled(previousOrders).length / previousOrders.length) * 100 : 0;

  return [
    { key: "revenue", label: "الإيراد", value: curRevenue, previous: prevRevenue, delta: computeDelta(curRevenue, prevRevenue), unit: "piastres", hint: "بدون الشحن ورسوم الدفع عند الاستلام" },
    { key: "orders", label: "الطلبات", value: curOrderCount, previous: prevOrderCount, delta: computeDelta(curOrderCount, prevOrderCount), unit: "count" },
    { key: "units", label: "القطع", value: curUnits, previous: prevUnits, delta: computeDelta(curUnits, prevUnits), unit: "count" },
    { key: "averageOrder", label: "متوسط الطلب", value: Math.round(curAvg), previous: Math.round(prevAvg), delta: computeDelta(curAvg, prevAvg), unit: "piastres" },
    { key: "cancellationRate", label: "نسبة الإلغاء", value: curCancelRate, previous: prevCancelRate, delta: computeDelta(curCancelRate, prevCancelRate), unit: "percent", hint: "من كل الطلبات في الفترة" },
  ];
}

function buildSeries(
  currentOrders: OrderForSales[],
  previousOrders: OrderForSales[],
  period: ResolvedPeriod,
  orderSet: SalesOrderSet
): ReportSeries[] {
  const statuses = statusesForOrderSet(orderSet);
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const bucket = (orders: OrderForSales[]) => {
    const map = new Map<string, number>();
    for (const o of orders) {
      if (!statuses.includes(o.status)) continue;
      const key = dayKey(o.createdAt);
      map.set(key, (map.get(key) ?? 0) + netMerchandisePiastres(o));
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

/**
 * PM ruling (10.13 verifier fix) — the product/category breakdowns previously summed
 * `OrderItem.totalPiastres` (the line's own subtotal share, no discount applied), which no
 * longer reconciled to الإيراد once that tile moved to net merchandise. An item's revenue is
 * now the order's net merchandise spread over its items by their share of the order's
 * subtotal: `round(item.totalPiastres × netMerchandise(order) ÷ order.subtotalPiastres)` (0
 * when `subtotalPiastres` is 0 — never divide by zero). Exported for a database-free unit
 * test; per-item rounding can drift the row sum from the headline by up to a few piastres
 * (documented, not "fixed" further — there is no canonical way to force integer shares of an
 * integer total to sum exactly without an arbitrary tie-breaker the owner never asked for).
 */
export function allocatedItemRevenue(item: { orderId: string; totalPiastres: number }, orderById: Map<string, OrderForSales>): number {
  const order = orderById.get(item.orderId);
  if (!order || order.subtotalPiastres === 0) return 0;
  return Math.round((item.totalPiastres * netMerchandisePiastres(order)) / order.subtotalPiastres);
}

/**
 * PM ruling (10.14 print-page review) — the category breakdown's "الطلبات" column had read 0
 * on every row since the category breakdown was built (`categoryMap`'s rows were seeded with
 * `orderCount: 0` and nothing ever incremented it): the same order can contribute items to
 * several categories, so a category's order count is the number of *distinct orders* with at
 * least one item in that category, not a per-item tally. Exported (pure, no DB) so it is
 * unit-tested against hand-built items rather than only exercised end-to-end.
 */
export function countDistinctOrdersByKey<T extends { orderId: string }>(
  items: T[],
  keyOf: (item: T) => string
): Map<string, number> {
  const sets = new Map<string, Set<string>>();
  for (const it of items) {
    const key = keyOf(it);
    const set = sets.get(key) ?? new Set<string>();
    set.add(it.orderId);
    sets.set(key, set);
  }
  return new Map(Array.from(sets.entries()).map(([key, ids]) => [key, ids.size]));
}

/** A variant's product identity, as needed to aggregate the product breakdown (10.17). */
export type VariantProductInfo = { productId: string; productSlug: string | null };

/**
 * 10.17 (PM ruling) — "حسب المنتج" is one row per product, not per variant: sums units and
 * allocated revenue across every sold variant of the product, carries the previous-period
 * revenue and share the same way, and counts distinct orders containing *any* of the
 * product's variants (`countDistinctOrdersByKey`, keyed by product id — an order with two
 * sizes of the same product counts once, not twice). Pure and exported for a database-free
 * unit test; `productInfoByVariant` is supplied by the caller (a single `Variant.findMany`
 * covering both periods' variant ids — see `buildFullBreakdowns`) so this function needs no
 * Prisma access of its own. A variant missing from `productInfoByVariant` (its product was
 * deleted) falls back to its own variant id as the grouping key, so it still gets a row
 * rather than silently vanishing or merging into an unrelated product.
 */
export function buildProductRows(
  currentItems: OrderItemForSales[],
  previousItems: OrderItemForSales[],
  curOrderById: Map<string, OrderForSales>,
  prevOrderById: Map<string, OrderForSales>,
  productInfoByVariant: Map<string, VariantProductInfo>,
  totalRevenue: number
): ProductBreakdownRow[] {
  const keyOf = (variantId: string) => productInfoByVariant.get(variantId)?.productId ?? variantId;

  const curByProduct = new Map<string, { units: number; revenue: number; productName: string; productSlug: string | null }>();
  for (const it of currentItems) {
    const key = keyOf(it.variantId);
    const existing = curByProduct.get(key) ?? {
      units: 0,
      revenue: 0,
      productName: it.productName,
      productSlug: productInfoByVariant.get(it.variantId)?.productSlug ?? null,
    };
    existing.units += it.quantity;
    existing.revenue += allocatedItemRevenue(it, curOrderById);
    curByProduct.set(key, existing);
  }

  const prevByProduct = new Map<string, number>();
  for (const it of previousItems) {
    const key = keyOf(it.variantId);
    prevByProduct.set(key, (prevByProduct.get(key) ?? 0) + allocatedItemRevenue(it, prevOrderById));
  }

  const orderCounts = countDistinctOrdersByKey(currentItems, (it) => keyOf(it.variantId));

  return Array.from(curByProduct.entries())
    .map(([productId, row]) => ({
      productId,
      productName: row.productName,
      productSlug: row.productSlug,
      units: row.units,
      revenuePiastres: row.revenue,
      previousRevenuePiastres: prevByProduct.get(productId) ?? 0,
      revenueSharePct: totalRevenue > 0 ? (row.revenue / totalRevenue) * 100 : 0,
      orderCount: orderCounts.get(productId) ?? 0,
    }))
    .sort((a, b) => b.revenuePiastres - a.revenuePiastres);
}

async function buildFullBreakdowns(
  scope: ReportScope,
  currentOrders: OrderForSales[],
  previousOrders: OrderForSales[],
  currentItems: OrderItemForSales[],
  previousItems: OrderItemForSales[],
  orderSet: SalesOrderSet
): Promise<FullBreakdowns> {
  const statuses = statusesForOrderSet(orderSet);
  const inSet = (o: OrderForSales) => statuses.includes(o.status);
  const totalRevenue = currentOrders.filter(inSet).reduce((s, o) => s + netMerchandisePiastres(o), 0);

  // Order lookup for the per-item discount allocation below — `currentItems`/`previousItems`
  // are already filtered to the chosen order set (`loadOrderItems`), so every item's order is
  // present in `currentOrders`/`previousOrders` (loaded unfiltered, over the same period).
  const curOrderById = new Map(currentOrders.map((o) => [o.id, o]));
  const prevOrderById = new Map(previousOrders.map((o) => [o.id, o]));

  // --- product --- revenue is each item's allocated share of its order's net merchandise
  // (10.13 verifier fix), never the item's raw `totalPiastres` (no discount applied) — so
  // this table's rows reconcile to الإيراد.
  const curByVariant = new Map<string, { units: number; revenue: number; productName: string }>();
  for (const it of currentItems) {
    const row = curByVariant.get(it.variantId) ?? { units: 0, revenue: 0, productName: it.productName };
    row.units += it.quantity;
    row.revenue += allocatedItemRevenue(it, curOrderById);
    curByVariant.set(it.variantId, row);
  }
  // --- category (via variant -> product -> category); the variant lookup covers both
  // periods' variant ids, since a variant that only sold in the previous period still needs
  // its category resolved to land in that category's previous-revenue map. Also carries the
  // product's slug (10.16), for the product breakdown's identifier line — one query, no
  // second lookup per row. ---
  const variantIds = Array.from(curByVariant.keys());
  const prevVariantIds = Array.from(new Set(previousItems.map((it) => it.variantId)));
  const allVariantIdsForCategory = Array.from(new Set([...variantIds, ...prevVariantIds]));
  const variants = allVariantIdsForCategory.length
    ? await prisma.variant.findMany({
        where: { id: { in: allVariantIdsForCategory } },
        select: { id: true, product: { select: { id: true, slug: true, category: { select: { id: true, name: true } } } } },
      })
    : [];
  const categoryByVariant = new Map(variants.map((v) => [v.id, v.product.category]));
  // 10.17 — product identity per variant (id + slug), for `buildProductRows`'s per-product
  // aggregation; one query covers both periods' variant ids, same as `categoryByVariant`.
  const productInfoByVariant = new Map<string, VariantProductInfo>(
    variants.map((v) => [v.id, { productId: v.product.id, productSlug: v.product.slug }])
  );

  const productRows = buildProductRows(currentItems, previousItems, curOrderById, prevOrderById, productInfoByVariant, totalRevenue);
  const categoryOrderCounts = countDistinctOrdersByKey(currentItems, (it) => categoryByVariant.get(it.variantId)?.id ?? "uncategorised");
  const categoryMap = new Map<string, BaseSimpleRow>();
  for (const [variantId, row] of curByVariant) {
    const cat = categoryByVariant.get(variantId);
    const key = cat?.id ?? "uncategorised";
    const label = cat?.name ?? "غير مصنف";
    const existing = categoryMap.get(key) ?? { key, label, units: 0, revenuePiastres: 0, orderCount: categoryOrderCounts.get(key) ?? 0 };
    existing.units += row.units;
    existing.revenuePiastres += row.revenue;
    categoryMap.set(key, existing);
  }
  const prevCategoryRevenue = new Map<string, number>();
  for (const it of previousItems) {
    const cat = categoryByVariant.get(it.variantId);
    const key = cat?.id ?? "uncategorised";
    prevCategoryRevenue.set(key, (prevCategoryRevenue.get(key) ?? 0) + allocatedItemRevenue(it, prevOrderById));
  }
  const categoryRows = attachRevenueDelta(
    Array.from(categoryMap.values()).sort((a, b) => b.revenuePiastres - a.revenuePiastres),
    prevCategoryRevenue
  );

  // --- governorate --- cancellation totals over every order in the period, unfiltered by the
  // set (same funnel-number rule as the headline); revenue/orders scoped to the set.
  const setOrders = currentOrders.filter(inSet);
  const prevSetOrders = previousOrders.filter(inSet);
  const govMap = new Map<string, { revenue: number; orders: number; cancelled: number; total: number }>();
  for (const o of currentOrders) {
    const gov = governorateOf(o);
    const row = govMap.get(gov) ?? { revenue: 0, orders: 0, cancelled: 0, total: 0 };
    row.total += 1;
    if (o.status === "CANCELLED") row.cancelled += 1;
    govMap.set(gov, row);
  }
  for (const o of setOrders) {
    const gov = governorateOf(o);
    const row = govMap.get(gov)!;
    row.revenue += netMerchandisePiastres(o);
    row.orders += 1;
  }
  const prevGovRevenue = new Map<string, number>();
  for (const o of prevSetOrders) {
    const gov = governorateOf(o);
    prevGovRevenue.set(gov, (prevGovRevenue.get(gov) ?? 0) + netMerchandisePiastres(o));
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
  for (const o of setOrders) {
    const key = o.paymentMethod;
    const row = paymentMap.get(key) ?? { key, label: key, units: 0, revenuePiastres: 0, orderCount: 0 };
    row.revenuePiastres += netMerchandisePiastres(o);
    row.orderCount += 1;
    paymentMap.set(key, row);
  }
  const prevPaymentRevenue = new Map<string, number>();
  for (const o of prevSetOrders) {
    prevPaymentRevenue.set(o.paymentMethod, (prevPaymentRevenue.get(o.paymentMethod) ?? 0) + netMerchandisePiastres(o));
  }
  const paymentRows = attachRevenueDelta(
    Array.from(paymentMap.values()).sort((a, b) => b.revenuePiastres - a.revenuePiastres),
    prevPaymentRevenue
  );

  // --- day ---
  const dayMap = new Map<string, { revenue: number; orders: number }>();
  for (const o of setOrders) {
    const key = o.createdAt.toISOString().slice(0, 10);
    const row = dayMap.get(key) ?? { revenue: 0, orders: 0 };
    row.revenue += netMerchandisePiastres(o);
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
      if (inSet(o)) {
        row.revenue += netMerchandisePiastres(o);
        row.orders += 1;
      }
      partnerMap.set(key, row);
    }
    const prevPartnerRevenue = new Map<string, number>();
    for (const o of prevSetOrders) {
      const key = o.assignedPartnerId ?? "unassigned";
      prevPartnerRevenue.set(key, (prevPartnerRevenue.get(key) ?? 0) + netMerchandisePiastres(o));
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
  currentItems: OrderItemForSales[],
  breakdowns: FullBreakdowns
): Promise<ReportAction[]> {
  const actions: ReportAction[] = [];

  // Top sellers under threshold -> stock. 10.17 — the product breakdown is now aggregated
  // per product (not per variant), so this stock check (which needs actual variant ids to
  // look up `PartnerInventory`) recomputes its own per-variant revenue ranking rather than
  // reading `breakdowns.product`; same underlying numbers as before (top 10 variants by
  // allocated revenue in the current set), just computed locally instead of borrowed from a
  // table that no longer has variant rows.
  const curOrderById = new Map(currentOrders.map((o) => [o.id, o]));
  const variantRevenue = new Map<string, number>();
  for (const it of currentItems) {
    variantRevenue.set(it.variantId, (variantRevenue.get(it.variantId) ?? 0) + allocatedItemRevenue(it, curOrderById));
  }
  const topVariantIds = Array.from(variantRevenue.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);
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
