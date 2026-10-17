/**
 * Outlet sales report (backlog 11.5, plan `12-distributor-store-plan.md` §3) -
 * `GET /api/partner/reports/sales` for a DISTRIBUTOR. The source is `StoreSale` with status
 * COMPLETED (a VOIDED sale never counts: its stock went back and its money was not taken),
 * never `Order`. Same preset / period / previous-period contract as the agent report
 * (`resolvePeriod`), same response envelope (`PartnerReportResponse`) so the shared tiles,
 * trend chart and breakdown table render it unchanged.
 *
 * Days and hours are Africa/Cairo (the counter's clock), not the server's. Revenue is the
 * receipt subtotal (what the customer paid across the counter).
 */
import { prisma } from "@/lib/db";
import { PAYMENT_METHOD_LABELS } from "@/lib/sales/format";
import { cairoDateIso } from "./cairo-day";
import {
  addDaysIso,
  computeDelta,
  formatComparisonLabel,
  resolvePeriod,
  type PartnerReportResponse,
  type ReportAction,
  type ReportBreakdownPage,
  type ReportHeadline,
  type ReportSeries,
  type ResolvedPeriod,
  type SalesReportPreset,
} from "./partner-reports";
import { cairoRangeBounds } from "./velocity-source";
import { formatDateEn } from "@/lib/format-en-numbers";

export type OutletSaleLine = {
  quantity: number;
  unitPricePiastres: number;
  productName: string;
  variantName: string;
  sku: string;
  variantId: string;
  colorName: string | null;
  productId: string | null;
  productSlug: string | null;
};

export type OutletSaleRow = {
  id: string;
  soldAt: Date;
  paymentMethod: string;
  subtotalPiastres: number;
  items: OutletSaleLine[];
};

export type OutletProductRow = {
  productId: string;
  productName: string;
  productSlug: string | null;
  units: number;
  revenuePiastres: number;
  previousRevenuePiastres: number;
  revenueSharePct: number;
  receiptCount: number;
};

export type OutletPaymentRow = {
  key: string;
  label: string;
  receiptCount: number;
  revenuePiastres: number;
  previousRevenuePiastres: number;
  revenueSharePct: number;
};

export type OutletAttributeRow = {
  key: string;
  label: string;
  units: number;
  revenuePiastres: number;
  revenueSharePct: number;
};

export type OutletDayRow = { date: string; receiptCount: number; units: number; revenuePiastres: number };

export type OutletHourRow = { hour: number; label: string; receiptCount: number; revenuePiastres: number };

export type OutletSalesBreakdowns = {
  product: ReportBreakdownPage<OutletProductRow>;
  payment: ReportBreakdownPage<OutletPaymentRow>;
  size: ReportBreakdownPage<OutletAttributeRow>;
  colour: ReportBreakdownPage<OutletAttributeRow>;
  day: ReportBreakdownPage<OutletDayRow>;
  hour: ReportBreakdownPage<OutletHourRow>;
};

export type OutletSalesBreakdownKey = keyof OutletSalesBreakdowns;
export const OUTLET_BREAKDOWN_KEYS: OutletSalesBreakdownKey[] = ["product", "payment", "size", "colour", "day", "hour"];

export type OutletSalesReportResponse = PartnerReportResponse<OutletSalesBreakdowns>;

const PAGE_SIZE = 25;
/** Size and colour are "top lists", not exhaustive tables. */
const TOP_LIST_SIZE = 10;

/** The slice of Prisma this module reads - lets a unit test pass a fake database. */
export type OutletSalesDb = {
  storeSale: {
    findMany(args: unknown): Promise<
      {
        id: string;
        soldAt: Date;
        paymentMethod: string;
        subtotalPiastres: number;
        items: {
          quantity: number;
          unitPricePiastres: number;
          productName: string;
          variantName: string;
          sku: string;
          variantId: string;
          variant: { colorName: string | null; product: { id: string; slug: string } | null } | null;
        }[];
      }[]
    >;
  };
};

async function loadSales(db: OutletSalesDb, partnerId: string, range: { from: string; to: string }): Promise<OutletSaleRow[]> {
  const sales = await db.storeSale.findMany({
    where: { partnerId, status: "COMPLETED", soldAt: cairoRangeBounds(range) },
    select: {
      id: true,
      soldAt: true,
      paymentMethod: true,
      subtotalPiastres: true,
      items: {
        select: {
          quantity: true,
          unitPricePiastres: true,
          productName: true,
          variantName: true,
          sku: true,
          variantId: true,
          variant: { select: { colorName: true, product: { select: { id: true, slug: true } } } },
        },
      },
    },
  });
  return sales.map((s) => ({
    id: s.id,
    soldAt: s.soldAt,
    paymentMethod: s.paymentMethod,
    subtotalPiastres: s.subtotalPiastres,
    items: s.items.map((it) => ({
      quantity: it.quantity,
      unitPricePiastres: it.unitPricePiastres,
      productName: it.productName,
      variantName: it.variantName,
      sku: it.sku,
      variantId: it.variantId,
      colorName: it.variant?.colorName ?? null,
      productId: it.variant?.product?.id ?? null,
      productSlug: it.variant?.product?.slug ?? null,
    })),
  }));
}

const cairoHourFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hour12: false });

/** The Africa/Cairo clock hour (0-23) of an instant. */
export function cairoHour(date: Date): number {
  return Number(cairoHourFormatter.format(date)) % 24;
}

const lineRevenue = (l: OutletSaleLine) => l.quantity * l.unitPricePiastres;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const unitsOf = (sales: OutletSaleRow[]) => sum(sales.flatMap((s) => s.items.map((i) => i.quantity)));
const revenueOf = (sales: OutletSaleRow[]) => sum(sales.map((s) => s.subtotalPiastres));
const sharePct = (part: number, total: number) => (total > 0 ? (part / total) * 100 : 0);

function paginate<T>(rows: T[], page: number, all?: boolean): ReportBreakdownPage<T> {
  if (all) return { rows, page: 1, pageSize: rows.length, total: rows.length };
  const start = (page - 1) * PAGE_SIZE;
  return { rows: rows.slice(start, start + PAGE_SIZE), page, pageSize: PAGE_SIZE, total: rows.length };
}

export function buildOutletHeadline(current: OutletSaleRow[], previous: OutletSaleRow[]): ReportHeadline[] {
  const curRevenue = revenueOf(current);
  const prevRevenue = revenueOf(previous);
  const curUnits = unitsOf(current);
  const prevUnits = unitsOf(previous);
  const curAvg = current.length > 0 ? Math.round(curRevenue / current.length) : 0;
  const prevAvg = previous.length > 0 ? Math.round(prevRevenue / previous.length) : 0;
  return [
    { key: "revenue", label: "الإيراد", value: curRevenue, previous: prevRevenue, delta: computeDelta(curRevenue, prevRevenue), unit: "piastres", hint: "إجمالي الإيصالات المكتملة" },
    { key: "receipts", label: "الإيصالات", value: current.length, previous: previous.length, delta: computeDelta(current.length, previous.length), unit: "count", hint: "الملغاة غير محسوبة" },
    { key: "units", label: "القطع", value: curUnits, previous: prevUnits, delta: computeDelta(curUnits, prevUnits), unit: "count" },
    { key: "averageReceipt", label: "متوسط الإيصال", value: curAvg, previous: prevAvg, delta: computeDelta(curAvg, prevAvg), unit: "piastres" },
  ];
}

export function buildOutletSeries(current: OutletSaleRow[], previous: OutletSaleRow[], period: ResolvedPeriod): ReportSeries[] {
  const bucket = (sales: OutletSaleRow[]) => {
    const map = new Map<string, number>();
    for (const s of sales) {
      const key = cairoDateIso(s.soldAt);
      map.set(key, (map.get(key) ?? 0) + s.subtotalPiastres);
    }
    return map;
  };
  const cur = bucket(current);
  const prev = bucket(previous);
  const points: { x: string; y: number }[] = [];
  const previousPoints: { x: string; y: number }[] = [];
  for (let i = 0; i < period.days; i++) {
    const curDate = addDaysIso(period.current.from, i);
    const prevDate = addDaysIso(period.previous.from, i);
    points.push({ x: curDate, y: cur.get(curDate) ?? 0 });
    previousPoints.push({ x: curDate, y: prev.get(prevDate) ?? 0 });
  }
  return [{ key: "revenue", label: "الإيراد اليومي", points, previousPoints }];
}

type FullBreakdowns = {
  [K in OutletSalesBreakdownKey]: OutletSalesBreakdowns[K]["rows"];
};

export function buildOutletBreakdowns(current: OutletSaleRow[], previous: OutletSaleRow[]): FullBreakdowns {
  const totalRevenue = revenueOf(current);

  // By product: one row per Product (variants of one product merge). A line whose variant's
  // product was deleted falls back to its own snapshot name so nothing disappears.
  const productKey = (l: OutletSaleLine) => l.productId ?? `name:${l.productName}`;
  const prevByProduct = new Map<string, number>();
  for (const s of previous) for (const l of s.items) prevByProduct.set(productKey(l), (prevByProduct.get(productKey(l)) ?? 0) + lineRevenue(l));
  const products = new Map<string, OutletProductRow & { receipts: Set<string> }>();
  for (const s of current) {
    for (const l of s.items) {
      const key = productKey(l);
      const row =
        products.get(key) ??
        { productId: key, productName: l.productName, productSlug: l.productSlug, units: 0, revenuePiastres: 0, previousRevenuePiastres: prevByProduct.get(key) ?? 0, revenueSharePct: 0, receiptCount: 0, receipts: new Set<string>() };
      row.units += l.quantity;
      row.revenuePiastres += lineRevenue(l);
      row.receipts.add(s.id);
      products.set(key, row);
    }
  }
  const product: OutletProductRow[] = [...products.values()]
    .map(({ receipts, ...r }) => ({ ...r, receiptCount: receipts.size, revenueSharePct: sharePct(r.revenuePiastres, totalRevenue) }))
    .sort((a, b) => b.revenuePiastres - a.revenuePiastres || a.productName.localeCompare(b.productName, "ar"));

  // By payment method: fixed categorical order (CASH, INSTAPAY, CARD), zero-revenue methods dropped.
  const prevByMethod = new Map<string, number>();
  for (const s of previous) prevByMethod.set(s.paymentMethod, (prevByMethod.get(s.paymentMethod) ?? 0) + s.subtotalPiastres);
  const payment: OutletPaymentRow[] = (["CASH", "INSTAPAY", "CARD"] as const)
    .map((method) => {
      const sales = current.filter((s) => s.paymentMethod === method);
      const revenuePiastres = revenueOf(sales);
      return {
        key: method,
        label: PAYMENT_METHOD_LABELS[method],
        receiptCount: sales.length,
        revenuePiastres,
        previousRevenuePiastres: prevByMethod.get(method) ?? 0,
        revenueSharePct: sharePct(revenuePiastres, totalRevenue),
      };
    })
    .filter((r) => r.receiptCount > 0 || r.previousRevenuePiastres > 0);

  const attributeRows = (labelOf: (l: OutletSaleLine) => string): OutletAttributeRow[] => {
    const map = new Map<string, OutletAttributeRow>();
    for (const s of current) {
      for (const l of s.items) {
        const label = labelOf(l);
        const row = map.get(label) ?? { key: label, label, units: 0, revenuePiastres: 0, revenueSharePct: 0 };
        row.units += l.quantity;
        row.revenuePiastres += lineRevenue(l);
        map.set(label, row);
      }
    }
    const lineTotal = sum([...map.values()].map((r) => r.revenuePiastres));
    return [...map.values()]
      .map((r) => ({ ...r, revenueSharePct: sharePct(r.revenuePiastres, lineTotal) }))
      .sort((a, b) => b.units - a.units || b.revenuePiastres - a.revenuePiastres || a.label.localeCompare(b.label, "ar"))
      .slice(0, TOP_LIST_SIZE);
  };

  const dayMap = new Map<string, OutletDayRow>();
  for (const s of current) {
    const date = cairoDateIso(s.soldAt);
    const row = dayMap.get(date) ?? { date, receiptCount: 0, units: 0, revenuePiastres: 0 };
    row.receiptCount += 1;
    row.units += sum(s.items.map((i) => i.quantity));
    row.revenuePiastres += s.subtotalPiastres;
    dayMap.set(date, row);
  }
  const day = [...dayMap.values()].sort((a, b) => (a.date < b.date ? 1 : -1));

  const hourMap = new Map<number, OutletHourRow>();
  for (const s of current) {
    const hour = cairoHour(s.soldAt);
    const row = hourMap.get(hour) ?? { hour, label: `${String(hour).padStart(2, "0")}:00`, receiptCount: 0, revenuePiastres: 0 };
    row.receiptCount += 1;
    row.revenuePiastres += s.subtotalPiastres;
    hourMap.set(hour, row);
  }
  const hour = [...hourMap.values()].sort((a, b) => b.revenuePiastres - a.revenuePiastres || a.hour - b.hour);

  return {
    product,
    payment,
    size: attributeRows((l) => l.variantName || "—"),
    colour: attributeRows((l) => l.colorName || "—"),
    day,
    hour,
  };
}

function buildActions(full: FullBreakdowns): ReportAction[] {
  const actions: ReportAction[] = [];
  const top = full.product[0];
  if (top) actions.push({ label: `الأكثر إيرادًا: ${top.productName} (${top.units} قطعة)` });
  const peak = full.hour[0];
  if (peak) actions.push({ label: `أقوى ساعة بيع: ${peak.label} (${peak.receiptCount} إيصال)` });
  actions.push({ label: "راجع ما يحتاج إعادة طلب من المخزون", href: "/partner/reports/inventory" });
  return actions;
}

type Input = { preset: SalesReportPreset; from?: string; to?: string; page?: number; all?: boolean };

async function loadBoth(db: OutletSalesDb, partnerId: string, period: ResolvedPeriod) {
  return Promise.all([loadSales(db, partnerId, period.current), loadSales(db, partnerId, period.previous)]);
}

/** Full (unpaginated) rows of one breakdown - the CSV export's source. */
export async function getOutletSalesFullBreakdown(
  partnerId: string,
  input: Omit<Input, "page" | "all">,
  key: OutletSalesBreakdownKey,
  db: OutletSalesDb = prisma as unknown as OutletSalesDb
): Promise<unknown[]> {
  const period = resolvePeriod(input);
  const [current, previous] = await loadBoth(db, partnerId, period);
  return buildOutletBreakdowns(current, previous)[key];
}

export async function getOutletSalesReport(
  partnerId: string,
  input: Input,
  db: OutletSalesDb = prisma as unknown as OutletSalesDb
): Promise<OutletSalesReportResponse> {
  const period = resolvePeriod(input);
  const page = Math.max(1, input.page ?? 1);
  const [current, previous] = await loadBoth(db, partnerId, period);
  const full = buildOutletBreakdowns(current, previous);
  return {
    period,
    comparisonLabel: formatComparisonLabel(period, (iso) => formatDateEn(iso)),
    headline: buildOutletHeadline(current, previous),
    series: buildOutletSeries(current, previous, period),
    breakdowns: {
      product: paginate(full.product, page, input.all),
      payment: paginate(full.payment, page, input.all),
      size: paginate(full.size, page, input.all),
      colour: paginate(full.colour, page, input.all),
      day: paginate(full.day, page, input.all),
      hour: paginate(full.hour, page, input.all),
    },
    actions: buildActions(full),
  };
}
