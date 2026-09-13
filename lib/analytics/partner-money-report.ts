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
  computeDelta,
  formatComparisonLabel,
  periodToDateRange,
  resolvePeriod,
  type MoneyReportPreset,
  type PartnerReportResponse,
  type ReportAction,
  type ReportBreakdownPage,
  type ReportHeadline,
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
};

export type PaymentRow = {
  id: string;
  kind: "DOWN_PAYMENT" | "INSTALLMENT";
  amountPiastres: number;
  paidAt: string;
  reference: string | null;
  stockReceiptId: string | null;
  stockReceiptReference: string | null;
};

export type CollectedByMethodRow = { key: string; label: string; amountPiastres: number; orderCount: number };
export type CollectedByWeekPoint = { weekStart: string; amountPiastres: number };

export type MoneyReportBreakdowns = {
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

/** Every receipt + payment row, unpaginated — the "كشف حساب" CSV export's source of truth. */
export async function getPartnerStatementRows(
  partnerId: string
): Promise<{ receipts: ReceiptRow[]; payments: PaymentRow[] }> {
  const [receipts, payments] = await Promise.all([
    prisma.stockReceipt.findMany({
      where: { partnerId, kind: "FACTORY" },
      select: { id: true, reference: true, createdAt: true, totalCostPiastres: true, lines: { select: { quantity: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.partnerPayment.findMany({
      where: { partnerId },
      select: {
        id: true,
        kind: true,
        amountPiastres: true,
        paidAt: true,
        reference: true,
        stockReceiptId: true,
        stockReceipt: { select: { reference: true } },
      },
      orderBy: { paidAt: "desc" },
    }),
  ]);
  return {
    receipts: receipts.map((r) => ({
      id: r.id,
      reference: r.reference,
      createdAt: r.createdAt.toISOString(),
      units: r.lines.reduce((s, l) => s + l.quantity, 0),
      totalCostPiastres: r.totalCostPiastres ?? 0,
    })),
    payments: payments.map((p) => ({
      id: p.id,
      kind: p.kind,
      amountPiastres: p.amountPiastres,
      paidAt: p.paidAt.toISOString(),
      reference: p.reference,
      stockReceiptId: p.stockReceiptId,
      stockReceiptReference: p.stockReceipt?.reference ?? null,
    })),
  };
}

export async function getPartnerMoneyReport(
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
      select: { id: true, reference: true, createdAt: true, totalCostPiastres: true, lines: { select: { quantity: true } } },
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
      select: { totalPiastres: true },
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
  const methodMap = new Map<string, CollectedByMethodRow>();
  for (const o of currentDelivered) {
    const key = o.paymentMethod;
    const row = methodMap.get(key) ?? { key, label: PAYMENT_METHOD_LABELS[key] ?? key, amountPiastres: 0, orderCount: 0 };
    row.amountPiastres += o.totalPiastres;
    row.orderCount += 1;
    methodMap.set(key, row);
  }
  const methodRows = Array.from(methodMap.values()).sort((a, b) => b.amountPiastres - a.amountPiastres);

  // --- collected by week (whole period, current) ---
  const weekMap = new Map<string, number>();
  for (const o of currentDelivered) {
    const key = isoWeekStart(o.createdAt);
    weekMap.set(key, (weekMap.get(key) ?? 0) + o.totalPiastres);
  }
  const collectedByWeek = Array.from(weekMap.entries())
    .map(([weekStart, amountPiastres]) => ({ weekStart, amountPiastres }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  const receiptRows: ReceiptRow[] = allReceipts.map((r) => ({
    id: r.id,
    reference: r.reference,
    createdAt: r.createdAt.toISOString(),
    units: r.lines.reduce((s, l) => s + l.quantity, 0),
    totalCostPiastres: r.totalCostPiastres ?? 0,
  }));
  const paymentRows: PaymentRow[] = allPayments.map((p) => ({
    id: p.id,
    kind: p.kind,
    amountPiastres: p.amountPiastres,
    paidAt: p.paidAt.toISOString(),
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
