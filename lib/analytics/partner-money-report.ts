/**
 * Money report (backlog 5.6b) — `GET /api/partner/reports/money`. Question: "where do I
 * stand with the factory and with cash?" Two independent sides per `05-partner-portal-v2.md`
 * §1: the factory side (what the partner owes for stock received, minus what admin has
 * recorded as paid) and the cash side (what the partner has collected from customers, or is
 * still waiting to collect). The balance and every other point-in-time figure (all-time
 * received/paid, next installment, COD pending right now) carry `noComparison` per the
 * rule-12 exception (`04-decisions.md` 2026-09-13) — they are snapshots, not period sums.
 * Only the in-period flows (received in period, collected in period, margin estimate) get a
 * real comparison to the previous equal period.
 *
 * The balance arithmetic and the margin estimate are pure functions
 * (`computeBalance`/`computeMarginEstimate`) so they're directly unit-testable without a
 * database — `lib/analytics/partner-money-report.test.ts`.
 */
import { prisma } from "@/lib/db";
import { getPartnerCostRate } from "@/lib/partner/cost-rate";
import { netMerchandisePiastres } from "./queries";
import {
  attachPreviousAndDelta,
  computeDelta,
  formatComparisonLabel,
  isNetworkScope,
  periodToDateRange,
  resolvePeriod,
  type Delta,
  type MoneyReportPreset,
  type PartnerReportResponse,
  type ReportAction,
  type ReportBreakdownPage,
  type ReportHeadline,
  type ReportScope,
} from "./partner-reports";
import { formatDateEn } from "@/lib/format-en-numbers";

/** received − paid; positive = the partner still owes the factory. */
export function computeBalance(receivedPiastres: number, paidPiastres: number): number {
  return receivedPiastres - paidPiastres;
}

/** `round((1 − costRateBps/10000) × netMerchandisePiastres)` — the partner's kept share. */
export function computeMarginEstimate(costRateBps: number, netMerchandisePiastresTotal: number): number {
  return Math.round((1 - costRateBps / 10_000) * netMerchandisePiastresTotal);
}

export type ReceiptRow = {
  id: string;
  reference: string | null;
  createdAt: string;
  units: number;
  totalCostPiastres: number;
  /** Backlog 9.4a (b) — who entered this receipt, additive. */
  recordedBy: "PARTNER" | "ADMIN";
  /** The cost rate (basis points) snapshotted on this receipt's lines at apply time; null
   * for COUNT receipts (no cost snapshot) or a receipt with no priced lines. */
  rateBps: number | null;
};

export type PaymentRow = {
  id: string;
  kind: "DOWN_PAYMENT" | "INSTALLMENT";
  amountPiastres: number;
  paidAt: string;
  /** Backlog 9.2 — the admin home's "مستحقات شركاء" queue needs this per payment; the money
   * report itself still reads `dueAt` from its own separate `allPayments` query below. */
  dueAt: string | null;
  reference: string | null;
  stockReceiptId: string | null;
  stockReceiptReference: string | null;
};

export type CollectedByMethodRow = {
  key: string;
  label: string;
  amountPiastres: number;
  orderCount: number;
  /** 7.4 — previous-period collected amount for the same method, over `period.previous`. */
  previousPiastres: number;
  delta: Delta;
};
export type CollectedByWeekPoint = { weekStart: string; amountPiastres: number };

/** Backlog 9.6 (a) — network scope's first breakdown key: one row per partner, each computed
 * by calling this exact module's own partner-scoped `getPartnerMoneyReport` (B3: no separate
 * balance/margin arithmetic) so "owed per partner" is guaranteed to equal that partner's own
 * money report balance tile. `null` for the partner-scoped form. */
export type MoneyPartnerBreakdownRow = {
  key: string;
  label: string;
  owedPiastres: number;
  paidAllTimePiastres: number;
  receivedAllTimePiastres: number;
};

export type MoneyReportBreakdowns = {
  byPartner: ReportBreakdownPage<MoneyPartnerBreakdownRow> | null;
  receipts: ReportBreakdownPage<ReceiptRow>;
  payments: ReportBreakdownPage<PaymentRow>;
  collectedByMethod: ReportBreakdownPage<CollectedByMethodRow>;
};

export type MoneyReportResponse = PartnerReportResponse<MoneyReportBreakdowns> & {
  costRatePct: number;
  nextInstallment: { amountPiastres: number; dueAt: string } | null;
  collectedByWeek: CollectedByWeekPoint[];
};

const PAGE_SIZE = 25;
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  COD: "الدفع عند الاستلام",
  INSTAPAY_PREPAID: "إنستاباي",
  PAYMOB: "بطاقة (Paymob)",
};

function isoWeekStart(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0 = Sunday
  const offsetFromSaturday = (day - 6 + 7) % 7; // Saturday-start week, matches lib/partner/today.ts
  date.setUTCDate(date.getUTCDate() - offsetFromSaturday);
  return date.toISOString().slice(0, 10);
}

const RECEIPT_SELECT = {
  id: true,
  reference: true,
  createdAt: true,
  totalCostPiastres: true,
  recordedBy: true,
  lines: { select: { quantity: true, unitCostPiastres: true, variant: { select: { pricePiastres: true } } } },
} as const;

type RawReceiptRow = {
  id: string;
  reference: string | null;
  createdAt: Date;
  totalCostPiastres: number | null;
  recordedBy: "PARTNER" | "ADMIN";
  lines: { quantity: number; unitCostPiastres: number | null; variant: { pricePiastres: number } }[];
};

/** All lines in one FACTORY receipt share the same rate (snapshotted once from the
 * partner's `costRateBps` at apply time) — so any single priced line's ratio reveals the
 * whole receipt's rate at that time. */
function mapReceiptRow(r: RawReceiptRow): ReceiptRow {
  const rateLine = r.lines.find((l) => l.unitCostPiastres !== null && l.variant.pricePiastres > 0);
  const rateBps = rateLine
    ? Math.round(((rateLine.unitCostPiastres as number) / rateLine.variant.pricePiastres) * 10_000)
    : null;
  return {
    id: r.id,
    reference: r.reference,
    createdAt: r.createdAt.toISOString(),
    units: r.lines.reduce((s, l) => s + l.quantity, 0),
    totalCostPiastres: r.totalCostPiastres ?? 0,
    recordedBy: r.recordedBy,
    rateBps,
  };
}

/** Every receipt + payment row, unpaginated — the "كشف حساب" CSV export's source of truth. */
export async function getPartnerStatementRows(
  partnerId: string
): Promise<{ receipts: ReceiptRow[]; payments: PaymentRow[] }> {
  const [receipts, payments] = await Promise.all([
    prisma.stockReceipt.findMany({
      where: { partnerId, kind: "FACTORY" },
      select: RECEIPT_SELECT,
      orderBy: { createdAt: "desc" },
    }),
    prisma.partnerPayment.findMany({
      where: { partnerId },
      select: {
        id: true,
        kind: true,
        amountPiastres: true,
        paidAt: true,
        dueAt: true,
        reference: true,
        stockReceiptId: true,
        stockReceipt: { select: { reference: true } },
      },
      orderBy: { paidAt: "desc" },
    }),
  ]);
  return {
    receipts: receipts.map(mapReceiptRow),
    payments: payments.map((p) => ({
      id: p.id,
      kind: p.kind,
      amountPiastres: p.amountPiastres,
      paidAt: p.paidAt.toISOString(),
      dueAt: p.dueAt ? p.dueAt.toISOString() : null,
      reference: p.reference,
      stockReceiptId: p.stockReceiptId,
      stockReceiptReference: p.stockReceipt?.reference ?? null,
    })),
  };
}

export async function getPartnerMoneyReport(
  scope: ReportScope,
  input: { preset: MoneyReportPreset; from?: string; to?: string; page?: number }
): Promise<MoneyReportResponse> {
  if (isNetworkScope(scope)) {
    return getNetworkMoneyReport(input);
  }
  return getPartnerMoneyReportForOne(scope.partnerId, input);
}

/**
 * Backlog 9.6 (a) — every active partner's own money report, summed for the headline and
 * used verbatim as the `byPartner` breakdown's rows (B3: no separate balance arithmetic —
 * `computeBalance` is only ever called inside `getPartnerMoneyReportForOne`). The full
 * receipts/payments/collectedByMethod ledgers and the weekly chart stay partner-scoped
 * concepts (per-partner statement export already covers the audit trail) — this task's
 * explicit acceptance is the headline sums and the per-partner owed/paid/received rows.
 */
async function getNetworkMoneyReport(
  input: { preset: MoneyReportPreset; from?: string; to?: string; page?: number }
): Promise<MoneyReportResponse> {
  const period = resolvePeriod(input);
  const partners = await prisma.partner.findMany({ where: { isActive: true }, select: { id: true, name: true } });
  const perPartnerReports = await Promise.all(
    partners.map(async (p) => ({ partner: p, report: await getPartnerMoneyReportForOne(p.id, input) }))
  );

  const byKey = (report: MoneyReportResponse) => Object.fromEntries(report.headline.map((h) => [h.key, h]));
  const sums = {
    receivedAllTime: 0,
    paidAllTime: 0,
    balance: 0,
    receivedInPeriod: 0,
    previousReceivedInPeriod: 0,
    collectedInPeriod: 0,
    previousCollectedInPeriod: 0,
    codPendingNow: 0,
    marginEstimate: 0,
  };
  for (const { report } of perPartnerReports) {
    const h = byKey(report);
    sums.receivedAllTime += h.receivedAllTime.value;
    sums.paidAllTime += h.paidAllTime.value;
    sums.balance += h.balance.value;
    sums.receivedInPeriod += h.receivedInPeriod.value;
    sums.previousReceivedInPeriod += h.receivedInPeriod.previous;
    sums.collectedInPeriod += h.collectedInPeriod.value;
    sums.previousCollectedInPeriod += h.collectedInPeriod.previous;
    sums.codPendingNow += h.codPendingNow.value;
    sums.marginEstimate += h.marginEstimate.value;
  }

  const headline: ReportHeadline[] = [
    { key: "receivedAllTime", label: "قيمة البضاعة المستلمة", value: sums.receivedAllTime, previous: sums.receivedAllTime, delta: computeDelta(sums.receivedAllTime, sums.receivedAllTime), unit: "piastres", hint: "منذ البداية — رصيد تراكمي لكل الشبكة", noComparison: true },
    { key: "paidAllTime", label: "دفعات الشبكة وأقساطها", value: sums.paidAllTime, previous: sums.paidAllTime, delta: computeDelta(sums.paidAllTime, sums.paidAllTime), unit: "piastres", hint: "منذ البداية — رصيد تراكمي لكل الشبكة", noComparison: true },
    { key: "balance", label: "المتبقي على الشبكة", value: sums.balance, previous: sums.balance, delta: computeDelta(sums.balance, sums.balance), unit: "piastres", hint: "مجموع رصيد كل شريك — رصيد تراكمي بلا مقارنة", noComparison: true },
    { key: "receivedInPeriod", label: "مستلم خلال الفترة", value: sums.receivedInPeriod, previous: sums.previousReceivedInPeriod, delta: computeDelta(sums.receivedInPeriod, sums.previousReceivedInPeriod), unit: "piastres", hint: "من إيصالات المصنع لكل الشبكة" },
    { key: "collectedInPeriod", label: "محصّل خلال الفترة", value: sums.collectedInPeriod, previous: sums.previousCollectedInPeriod, delta: computeDelta(sums.collectedInPeriod, sums.previousCollectedInPeriod), unit: "piastres", hint: "طلبات تم تسليمها فقط" },
    { key: "codPendingNow", label: "بانتظار التحصيل", value: sums.codPendingNow, previous: sums.codPendingNow, delta: computeDelta(sums.codPendingNow, sums.codPendingNow), unit: "piastres", hint: "دفع عند الاستلام، مشحون ولم يُسلَّم بعد — رصيد لحظي", noComparison: true },
    { key: "marginEstimate", label: "الهامش التقديري", value: sums.marginEstimate, previous: sums.marginEstimate, delta: computeDelta(sums.marginEstimate, sums.marginEstimate), unit: "piastres", hint: "مجموع هامش كل شريك خلال الفترة", noComparison: true },
  ];

  const byPartner: MoneyPartnerBreakdownRow[] = perPartnerReports
    .map(({ partner, report }) => {
      const h = byKey(report);
      return {
        key: partner.id,
        label: partner.name,
        owedPiastres: h.balance.value,
        paidAllTimePiastres: h.paidAllTime.value,
        receivedAllTimePiastres: h.receivedAllTime.value,
      };
    })
    .sort((a, b) => b.owedPiastres - a.owedPiastres);

  const emptyPage = <T,>(): ReportBreakdownPage<T> => ({ rows: [], page: 1, pageSize: PAGE_SIZE, total: 0 });

  return {
    period,
    comparisonLabel: formatComparisonLabel(period, (iso) => formatDateEn(iso)),
    headline,
    series: [],
    breakdowns: {
      byPartner: { rows: byPartner, page: 1, pageSize: byPartner.length || 1, total: byPartner.length },
      receipts: emptyPage(),
      payments: emptyPage(),
      collectedByMethod: emptyPage(),
    },
    actions: [],
    costRatePct: 0,
    nextInstallment: null,
    collectedByWeek: [],
  };
}

async function getPartnerMoneyReportForOne(
  partnerId: string,
  input: { preset: MoneyReportPreset; from?: string; to?: string; page?: number }
): Promise<MoneyReportResponse> {
  const period = resolvePeriod(input);
  const page = Math.max(1, input.page ?? 1);
  const currentRange = periodToDateRange(period.current);
  const previousRange = periodToDateRange(period.previous);
  const today = new Date();

  const [costRateBps, allReceipts, allPayments, currentDelivered, previousDelivered, codShipped] = await Promise.all([
    getPartnerCostRate(partnerId),
    prisma.stockReceipt.findMany({
      where: { partnerId, kind: "FACTORY" },
      select: RECEIPT_SELECT,
      orderBy: { createdAt: "desc" },
    }),
    prisma.partnerPayment.findMany({
      where: { partnerId },
      select: {
        id: true,
        kind: true,
        amountPiastres: true,
        paidAt: true,
        dueAt: true,
        reference: true,
        stockReceiptId: true,
        stockReceipt: { select: { reference: true } },
      },
      orderBy: { paidAt: "desc" },
    }),
    prisma.order.findMany({
      where: { assignedPartnerId: partnerId, status: "DELIVERED", createdAt: { gte: currentRange.from, lte: currentRange.to } },
      select: { totalPiastres: true, paymentMethod: true, createdAt: true, subtotalPiastres: true, discountPiastres: true, seniorFreeValuePiastres: true },
    }),
    prisma.order.findMany({
      where: { assignedPartnerId: partnerId, status: "DELIVERED", createdAt: { gte: previousRange.from, lte: previousRange.to } },
      select: { totalPiastres: true, paymentMethod: true },
    }),
    prisma.order.aggregate({
      where: { assignedPartnerId: partnerId, paymentMethod: "COD", status: "SHIPPED" },
      _sum: { totalPiastres: true },
    }),
  ]);

  const receivedAllTime = allReceipts.reduce((s, r) => s + (r.totalCostPiastres ?? 0), 0);
  const paidAllTime = allPayments.reduce((s, p) => s + p.amountPiastres, 0);
  const balance = computeBalance(receivedAllTime, paidAllTime);

  const receivedInPeriod = allReceipts
    .filter((r) => r.createdAt >= currentRange.from && r.createdAt <= currentRange.to)
    .reduce((s, r) => s + (r.totalCostPiastres ?? 0), 0);
  const receivedInPreviousPeriod = allReceipts
    .filter((r) => r.createdAt >= previousRange.from && r.createdAt <= previousRange.to)
    .reduce((s, r) => s + (r.totalCostPiastres ?? 0), 0);

  const collectedInPeriod = currentDelivered.reduce((s, o) => s + o.totalPiastres, 0);
  const collectedInPreviousPeriod = previousDelivered.reduce((s, o) => s + o.totalPiastres, 0);

  const codPendingNow = codShipped._sum.totalPiastres ?? 0;

  // Margin is a period-derived estimate, but still rendered `noComparison` — it is a rate
  // (1 − costRate) applied to this period's own delivered merchandise, not a flow that is
  // meaningful to diff against the previous period's rate-adjusted merchandise the same way
  // revenue is; showing a raw delta risks implying the *rate* changed when only volume did.
  const netMerchandiseCurrent = currentDelivered.reduce((s, o) => s + netMerchandisePiastres(o), 0);
  const marginEstimateCurrent = computeMarginEstimate(costRateBps, netMerchandiseCurrent);

  const nextInstallmentRow = allPayments
    .filter((p) => p.dueAt && p.dueAt >= today)
    .sort((a, b) => (a.dueAt as Date).getTime() - (b.dueAt as Date).getTime())[0];

  const headline: ReportHeadline[] = [
    {
      key: "receivedAllTime",
      label: "قيمة البضاعة المستلمة",
      value: receivedAllTime,
      previous: receivedAllTime,
      delta: computeDelta(receivedAllTime, receivedAllTime),
      unit: "piastres",
      hint: "منذ البداية — رصيد تراكمي",
      noComparison: true,
    },
    {
      key: "paidAllTime",
      label: "دفعاتك وأقساطك",
      value: paidAllTime,
      previous: paidAllTime,
      delta: computeDelta(paidAllTime, paidAllTime),
      unit: "piastres",
      hint: "منذ البداية — رصيد تراكمي",
      noComparison: true,
    },
    {
      key: "balance",
      label: "المتبقي عليك",
      value: balance,
      previous: balance,
      delta: computeDelta(balance, balance),
      unit: "piastres",
      hint: nextInstallmentRow
        ? `القسط القادم ${formatDateEn(nextInstallmentRow.dueAt!.toISOString().slice(0, 10))} — رصيد تراكمي بلا مقارنة`
        : "لا يوجد قسط قادم مسجّل — رصيد تراكمي بلا مقارنة",
      noComparison: true,
    },
    {
      key: "receivedInPeriod",
      label: "مستلم خلال الفترة",
      value: receivedInPeriod,
      previous: receivedInPreviousPeriod,
      delta: computeDelta(receivedInPeriod, receivedInPreviousPeriod),
      unit: "piastres",
      hint: "من إيصالات المصنع",
    },
    {
      key: "collectedInPeriod",
      label: "محصّل خلال الفترة",
      value: collectedInPeriod,
      previous: collectedInPreviousPeriod,
      delta: computeDelta(collectedInPeriod, collectedInPreviousPeriod),
      unit: "piastres",
      hint: "طلبات تم تسليمها فقط",
    },
    {
      key: "codPendingNow",
      label: "بانتظار التحصيل",
      value: codPendingNow,
      previous: codPendingNow,
      delta: computeDelta(codPendingNow, codPendingNow),
      unit: "piastres",
      hint: "دفع عند الاستلام، مشحون ولم يُسلَّم بعد — رصيد لحظي",
      noComparison: true,
    },
    {
      key: "marginEstimate",
      label: "هامشك التقديري",
      value: marginEstimateCurrent,
      previous: marginEstimateCurrent, // see note above
      delta: computeDelta(marginEstimateCurrent, marginEstimateCurrent),
      unit: "piastres",
      hint: `(١ − ${Math.round(costRateBps / 100)}%) من صافي البضاعة المُسلَّمة خلال الفترة`,
      noComparison: true,
    },
  ];

  // --- collected by method (current period, delivered) ---
  const methodMap = new Map<string, { key: string; label: string; amountPiastres: number; orderCount: number }>();
  for (const o of currentDelivered) {
    const key = o.paymentMethod;
    const row = methodMap.get(key) ?? { key, label: PAYMENT_METHOD_LABELS[key] ?? key, amountPiastres: 0, orderCount: 0 };
    row.amountPiastres += o.totalPiastres;
    row.orderCount += 1;
    methodMap.set(key, row);
  }
  const methodRowsBase = Array.from(methodMap.values()).sort((a, b) => b.amountPiastres - a.amountPiastres);
  const prevMethodMap = new Map<string, number>();
  for (const o of previousDelivered) {
    prevMethodMap.set(o.paymentMethod, (prevMethodMap.get(o.paymentMethod) ?? 0) + o.totalPiastres);
  }
  const methodRows: CollectedByMethodRow[] = attachPreviousAndDelta(
    methodRowsBase,
    (r) => r.key,
    (r) => r.amountPiastres,
    prevMethodMap,
    { previousKey: "previousPiastres", deltaKey: "delta" }
  );

  // --- collected by week (whole period, current) ---
  const weekMap = new Map<string, number>();
  for (const o of currentDelivered) {
    const key = isoWeekStart(o.createdAt);
    weekMap.set(key, (weekMap.get(key) ?? 0) + o.totalPiastres);
  }
  const collectedByWeek = Array.from(weekMap.entries())
    .map(([weekStart, amountPiastres]) => ({ weekStart, amountPiastres }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const receiptRows: ReceiptRow[] = allReceipts.map(mapReceiptRow);
  const paymentRows: PaymentRow[] = allPayments.map((p) => ({
    id: p.id,
    kind: p.kind,
    amountPiastres: p.amountPiastres,
    paidAt: p.paidAt.toISOString(),
    dueAt: p.dueAt ? p.dueAt.toISOString() : null,
    reference: p.reference,
    stockReceiptId: p.stockReceiptId,
    stockReceiptReference: p.stockReceipt?.reference ?? null,
  }));

  const paginate = <T,>(rows: T[]): ReportBreakdownPage<T> => ({
    rows: rows.slice((page - 1) * PAGE_SIZE, (page - 1) * PAGE_SIZE + PAGE_SIZE),
    page,
    pageSize: PAGE_SIZE,
    total: rows.length,
  });

  const actions: ReportAction[] = [{ label: "كشف حساب كامل بكل الاستلامات والدفعات", exportHref: "statement" }];

  return {
    period,
    comparisonLabel: formatComparisonLabel(period, (iso) => formatDateEn(iso)),
    headline,
    series: [],
    breakdowns: {
      byPartner: null,
      receipts: paginate(receiptRows),
      payments: paginate(paymentRows),
      collectedByMethod: paginate(methodRows),
    },
    actions,
    costRatePct: Math.round(costRateBps / 100),
    nextInstallment: nextInstallmentRow
      ? { amountPiastres: nextInstallmentRow.amountPiastres, dueAt: nextInstallmentRow.dueAt!.toISOString() }
      : null,
    collectedByWeek,
  };
}

/** "كشف حساب" (backlog 5.6b) — the full receipts+payments ledger as one CSV, unpaginated. */
export function buildStatementCsv(receipts: ReceiptRow[], payments: PaymentRow[]): string {
  const escape = (s: string | number) => {
    const str = String(s);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = ["Type,Date,Reference,Units,Amount (piastres)"];
  for (const r of receipts) {
    lines.push(["Receipt", r.createdAt.slice(0, 10), r.reference ?? "", r.units, r.totalCostPiastres].map(escape).join(","));
  }
  for (const p of payments) {
    lines.push(
      [p.kind === "DOWN_PAYMENT" ? "Down payment" : "Installment", p.paidAt.slice(0, 10), p.reference ?? p.stockReceiptReference ?? "", "", p.amountPiastres]
        .map(escape)
        .join(",")
    );
  }
  return `﻿${lines.join("\n")}`;
}
