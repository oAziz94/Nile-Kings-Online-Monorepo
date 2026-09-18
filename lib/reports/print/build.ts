/**
 * Backlog 10.14 — per-tab adapters from a report response (the same shape the on-screen tab
 * and its API route render) to the generic `PrintPageInput` the HTML renderer consumes. Reuses
 * the exact report functions the API handlers call (`getPartnerSalesReport` etc., called with
 * `all: true` — every row of every table, no page cap) — never a second computation of the
 * numbers.
 *
 * PM review (2026-09-18) fixed seven things in the first pass: (1) truncated tables/wrong
 * totals — fixed by `all: true` upstream, not here; (2) the category breakdown's zero
 * الطلبات column — fixed in `partner-sales-report.ts`'s `categoryMap`, not here; (3) no
 * all-zero rows in any print table (`dropAllZeroRows` below); (4) share bars scaled to the
 * table's own largest row, not to 100 (`scaleSharesToMax`); (5) the sales subtitle names the
 * source/exclusion once, and the cancellation rate moved to its own `subline` under the
 * tiles (`PrintPageInput.subline`); (6) raw enum values (payment method) get an Arabic label;
 * (7) column order is name → orders → units → revenue → share, consistently, across tables.
 */
import type { PrintPageInput, PrintTable, PrintTableCell } from "./render";
import type { SalesReportResponse, SalesOrderSet } from "@/lib/analytics/partner-sales-report";
import type { FulfilmentReportResponse } from "@/lib/analytics/partner-fulfilment-report";
import type { InventoryReportResponse } from "@/lib/analytics/partner-inventory-report";
import type { MoneyReportResponse } from "@/lib/analytics/partner-money-report";
import { PAYMENT_METHOD_LABELS } from "@/lib/analytics/partner-money-report";
import { piastresToEgp } from "@/lib/catalog";

/** Money in pounds with two decimals, Western numerals (backlog 10.14 — the print pages'
 * own money format; the on-screen tabs round to whole pounds, this does not). */
export function formatMoney2(piastres: number): string {
  return `${piastresToEgp(piastres).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

export function formatPct1(n: number): string {
  return `${n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function cell(text: string): PrintTableCell {
  return { text };
}

/** Backlog 10.14 PM review (fix 4) — the bar's width is the row's share *of the table's own
 * largest row*, so the top row always renders a full-width bar (the owner's model: Cairo's
 * 39.5% bar is the full track), never a literal percent-of-100 that leaves every real-world
 * row's bar looking nearly empty. `text` stays the real, un-normalised value. */
function scaleSharesToMax(values: number[], texts: string[]): PrintTableCell[] {
  const max = Math.max(0, ...values);
  return values.map((v, i) => ({ text: texts[i], sharePct: max > 0 ? (v / max) * 100 : 0 }));
}

/** Backlog 10.14 PM review (fix 3) — "no all-zero rows" on any print table: a row where every
 * value `isZero` flags is noise on paper (e.g. a governorate with 0 orders and 0 revenue in
 * the chosen set), not information. */
function dropAllZeroRows<T>(rows: T[], isZero: (row: T) => boolean): T[] {
  return rows.filter((r) => !isZero(r));
}

const ORDER_SET_SOURCE_LABEL: Record<SalesOrderSet, string> = {
  accomplished: "الطلبات المُسلَّمة فقط",
  active: "الطلبات النشطة (من التأكيد حتى الشحن)",
};

const PERIOD_FOOTNOTE =
  "الفترة تشمل من بداية أول يوم إلى نهاية آخر يوم، بتوقيت القاهرة.";

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------
export function buildSalesPrintData(
  data: SalesReportResponse,
  orderSet: SalesOrderSet,
  periodLabel: string,
  generatedAtLabel: string
): PrintPageInput {
  const byKey = new Map(data.headline.map((h) => [h.key, h]));
  const revenue = byKey.get("revenue")!;
  const orders = byKey.get("orders")!;
  const units = byKey.get("units")!;
  const averageOrder = byKey.get("averageOrder")!;
  const cancellationRate = byKey.get("cancellationRate")!;

  const tables: PrintTable[] = [];

  // --- حسب الشريك: name, orders, revenue, نسبة الإلغاء (trailing, doesn't fit the
  // orders/units/revenue/share model) ---
  if (data.breakdowns.byPartner) {
    const rows = dropAllZeroRows(data.breakdowns.byPartner.rows, (r) => r.orderCount === 0 && r.revenuePiastres === 0);
    tables.push({
      title: "حسب الشريك",
      columns: ["الشريك", "الطلبات", "الإيراد", "نسبة الإلغاء"],
      rows: rows.map((r) => [cell(r.label), cell(formatCount(r.orderCount)), cell(formatMoney2(r.revenuePiastres)), cell(formatPct1(r.cancellationRatePct))]),
      totalRow: [
        "الإجمالي",
        formatCount(rows.reduce((s, r) => s + r.orderCount, 0)),
        formatMoney2(rows.reduce((s, r) => s + r.revenuePiastres, 0)),
        "",
      ],
    });
  }

  // --- حسب المنتج: name, units, revenue, share (no per-item order count available) ---
  const productRows = dropAllZeroRows(data.breakdowns.product.rows, (r) => r.units === 0 && r.revenuePiastres === 0);
  const productShareCells = scaleSharesToMax(
    productRows.map((r) => r.revenueSharePct),
    productRows.map((r) => formatPct1(r.revenueSharePct))
  );
  const productTotalRevenue = productRows.reduce((s, r) => s + r.revenuePiastres, 0);
  tables.push({
    title: "حسب المنتج",
    columns: ["المنتج", "القطع", "الإيراد", "حصة الإيراد"],
    rows: productRows.map((r, i) => [cell(r.productName), cell(formatCount(r.units)), cell(formatMoney2(r.revenuePiastres)), productShareCells[i]]),
    totalRow: [
      "الإجمالي",
      formatCount(productRows.reduce((s, r) => s + r.units, 0)),
      formatMoney2(productTotalRevenue),
      formatPct1(productRows.reduce((s, r) => s + r.revenueSharePct, 0)),
    ],
    // The footnote states a fact — it stays only while the fact is true. الإجمالي above
    // reconciles to الإيراد within the documented ±1-piastre rounding drift (10.13's per-item
    // discount allocation); once it's an exact match (small periods, e.g. today), there's
    // nothing to explain.
    note: productTotalRevenue !== revenue.value ? "قد يختلف مجموع هذا العمود عن قيمة الإيراد بكسر قرش بسبب توزيع الخصم على كل صنف." : undefined,
  });

  // --- حسب الفئة: name, orders, units, revenue ---
  const categoryRows = dropAllZeroRows(data.breakdowns.category.rows, (r) => r.orderCount === 0 && r.units === 0 && r.revenuePiastres === 0);
  tables.push({
    title: "حسب الفئة",
    columns: ["الفئة", "الطلبات", "القطع", "الإيراد"],
    rows: categoryRows.map((r) => [cell(r.label), cell(formatCount(r.orderCount)), cell(formatCount(r.units)), cell(formatMoney2(r.revenuePiastres))]),
    totalRow: [
      "الإجمالي",
      formatCount(categoryRows.reduce((s, r) => s + r.orderCount, 0)),
      formatCount(categoryRows.reduce((s, r) => s + r.units, 0)),
      formatMoney2(categoryRows.reduce((s, r) => s + r.revenuePiastres, 0)),
    ],
  });

  // --- حسب المحافظة: name, orders, revenue — no cancellation column (computed over every
  // status, reads as nonsense next to a 0-orders-in-set row) and no all-zero rows. ---
  const govRows = dropAllZeroRows(data.breakdowns.governorate.rows, (r) => r.orderCount === 0 && r.revenuePiastres === 0);
  tables.push({
    title: "حسب المحافظة",
    columns: ["المحافظة", "الطلبات", "الإيراد"],
    rows: govRows.map((r) => [cell(r.label), cell(formatCount(r.orderCount)), cell(formatMoney2(r.revenuePiastres))]),
    totalRow: [
      "الإجمالي",
      formatCount(govRows.reduce((s, r) => s + r.orderCount, 0)),
      formatMoney2(govRows.reduce((s, r) => s + r.revenuePiastres, 0)),
    ],
  });

  // --- حسب طريقة الدفع: name, orders, revenue — Arabic label, not the raw enum value. ---
  const paymentRows = dropAllZeroRows(data.breakdowns.payment.rows, (r) => r.orderCount === 0 && r.revenuePiastres === 0);
  tables.push({
    title: "حسب طريقة الدفع",
    columns: ["طريقة الدفع", "الطلبات", "الإيراد"],
    rows: paymentRows.map((r) => [cell(PAYMENT_METHOD_LABELS[r.key] ?? r.label), cell(formatCount(r.orderCount)), cell(formatMoney2(r.revenuePiastres))]),
    totalRow: [
      "الإجمالي",
      formatCount(paymentRows.reduce((s, r) => s + r.orderCount, 0)),
      formatMoney2(paymentRows.reduce((s, r) => s + r.revenuePiastres, 0)),
    ],
  });

  // --- حسب اليوم: date, orders, revenue ---
  const dayRows = dropAllZeroRows(data.breakdowns.day.rows, (r) => r.orderCount === 0 && r.revenuePiastres === 0);
  tables.push({
    title: "حسب اليوم",
    columns: ["اليوم", "الطلبات", "الإيراد"],
    rows: dayRows.map((r) => [cell(r.date), cell(formatCount(r.orderCount)), cell(formatMoney2(r.revenuePiastres))]),
    totalRow: [
      "الإجمالي",
      formatCount(dayRows.reduce((s, r) => s + r.orderCount, 0)),
      formatMoney2(dayRows.reduce((s, r) => s + r.revenuePiastres, 0)),
    ],
  });

  return {
    tabLabel: "المبيعات",
    title: "تقرير المبيعات",
    subtitle: `المصدر: قاعدة بيانات الإنتاج · ${ORDER_SET_SOURCE_LABEL[orderSet]} · القيم بدون الشحن ورسوم الدفع عند الاستلام`,
    periodLabel,
    generatedAtLabel,
    tiles: [
      { label: revenue.label, value: formatMoney2(revenue.value) },
      { label: orders.label, value: formatCount(orders.value) },
      { label: units.label, value: formatCount(units.value) },
      { label: averageOrder.label, value: formatMoney2(averageOrder.value) },
    ],
    subline: `نسبة الإلغاء في الفترة: ${formatPct1(cancellationRate.value)} (من كل الطلبات)`,
    tables,
    footnote: PERIOD_FOOTNOTE,
  };
}

// ---------------------------------------------------------------------------
// Fulfilment
// ---------------------------------------------------------------------------
const STATUS_LABELS: Record<string, string> = {
  CREATED: "قيد الإنشاء",
  CONFIRMED: "مؤكد",
  PROCESSING: "قيد التجهيز",
  READY_TO_SHIP: "جاهز للشحن",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

export function buildFulfilmentPrintData(data: FulfilmentReportResponse, periodLabel: string, generatedAtLabel: string): PrintPageInput {
  const byKey = new Map(data.headline.map((h) => [h.key, h]));
  const confirm = byKey.get("medianHoursToConfirm")!;
  const ship = byKey.get("medianHoursToShip")!;
  const overdue = byKey.get("overdueRate")!;
  const delivered = byKey.get("deliveredRate")!;
  const cancellation = byKey.get("cancellationRate")!;

  const tables: PrintTable[] = [];

  if (data.breakdowns.byPartner) {
    const rows = dropAllZeroRows(data.breakdowns.byPartner.rows, (r) => r.totalOrders === 0);
    tables.push({
      title: "حسب الشريك",
      columns: ["الشريك", "الطلبات", "نسبة المتأخر", "نسبة الإلغاء", "نسبة التسليم"],
      rows: rows.map((r) => [cell(r.label), cell(formatCount(r.totalOrders)), cell(formatPct1(r.overdueRatePct)), cell(formatPct1(r.cancellationRatePct)), cell(formatPct1(r.deliveredRatePct))]),
      totalRow: ["الإجمالي", formatCount(rows.reduce((s, r) => s + r.totalOrders, 0)), "", "", ""],
    });
  }

  const slowRows = data.breakdowns.slowest.rows;
  tables.push({
    title: "أبطأ الطلبات",
    columns: ["الطلب", "الحالة", "ساعات للتأكيد", "ساعات للشحن"],
    rows: slowRows.map((r) => [
      cell(r.orderId.slice(0, 8)),
      cell(STATUS_LABELS[r.status] ?? r.status),
      cell(r.hoursToConfirm === null ? "—" : r.hoursToConfirm.toFixed(1)),
      cell(r.hoursToShip === null ? "—" : r.hoursToShip.toFixed(1)),
    ]),
  });

  const reasonRows = dropAllZeroRows(data.breakdowns.cancellationReason.rows, (r) => r.count === 0);
  tables.push({
    title: "أسباب الإلغاء",
    columns: ["السبب", "العدد"],
    rows: reasonRows.map((r) => [cell(r.label), cell(formatCount(r.count))]),
    totalRow: ["الإجمالي", formatCount(reasonRows.reduce((s, r) => s + r.count, 0))],
  });

  return {
    tabLabel: "التجهيز",
    title: "تقرير التجهيز",
    subtitle: "المصدر: قاعدة بيانات الإنتاج · تقرير التجهيز الشبكي",
    periodLabel,
    generatedAtLabel,
    tiles: [
      { label: confirm.label, value: `${confirm.value.toFixed(1)} ساعة` },
      { label: ship.label, value: `${ship.value.toFixed(1)} ساعة` },
      { label: overdue.label, value: formatPct1(overdue.value) },
      { label: delivered.label, value: formatPct1(delivered.value) },
    ],
    subline: `نسبة الإلغاء في الفترة: ${formatPct1(cancellation.value)} (من كل الطلبات)`,
    tables,
    footnote: PERIOD_FOOTNOTE,
  };
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------
export function buildInventoryPrintData(data: InventoryReportResponse, periodLabel: string, generatedAtLabel: string): PrintPageInput {
  const byKey = new Map(data.headline.map((h) => [h.key, h]));
  const sellable = byKey.get("sellable")!;
  const valuationCost = byKey.get("valuationCost")!;
  const medianCover = byKey.get("medianCover")!;
  const deadStockCount = byKey.get("deadStockCount")!;

  const tables: PrintTable[] = [];

  if (data.breakdowns.byPartner) {
    const rows = dropAllZeroRows(
      data.breakdowns.byPartner.rows,
      (r) => r.sellableUnits === 0 && r.deadStockSkus === 0 && r.outOfStockSkus === 0
    );
    tables.push({
      title: "حسب الشريك",
      columns: ["الشريك", "متوسط التغطية (يوم)", "راكدة", "نافدة", "قابل للبيع"],
      rows: rows.map((r) => [
        cell(r.label),
        cell(r.medianCoverDays === null ? "∞" : formatCount(Math.round(r.medianCoverDays))),
        cell(formatCount(r.deadStockSkus)),
        cell(formatCount(r.outOfStockSkus)),
        cell(formatCount(r.sellableUnits)),
      ]),
      totalRow: [
        "الإجمالي",
        "",
        formatCount(rows.reduce((s, r) => s + r.deadStockSkus, 0)),
        formatCount(rows.reduce((s, r) => s + r.outOfStockSkus, 0)),
        formatCount(rows.reduce((s, r) => s + r.sellableUnits, 0)),
      ],
    });
  }

  const skuRows = data.breakdowns.sku.rows;
  tables.push({
    title: "حسب الصنف",
    columns: data.breakdowns.byPartner
      ? ["الشريك", "المنتج", "قابل للبيع", "يبيع/أسبوع", "تغطية (يوم)", "مقترح الطلب"]
      : ["المنتج", "قابل للبيع", "يبيع/أسبوع", "تغطية (يوم)", "مقترح الطلب"],
    rows: skuRows.map((r) => {
      const base = [
        cell(`${r.productName} · ${r.variantName}${r.colorName ? ` · ${r.colorName}` : ""}`),
        cell(formatCount(r.sellable)),
        cell(r.velocityPerWeek.toFixed(1)),
        cell(r.daysOfCover === null ? "∞" : formatCount(Math.round(r.daysOfCover))),
        cell(formatCount(r.suggestedReorder)),
      ];
      return r.partnerName ? [cell(r.partnerName), ...base] : base;
    }),
    totalRow: data.breakdowns.byPartner
      ? ["", "الإجمالي", formatCount(skuRows.reduce((s, r) => s + r.sellable, 0)), "", "", formatCount(skuRows.reduce((s, r) => s + r.suggestedReorder, 0))]
      : ["الإجمالي", formatCount(skuRows.reduce((s, r) => s + r.sellable, 0)), "", "", formatCount(skuRows.reduce((s, r) => s + r.suggestedReorder, 0))],
    note: "مقترح الطلب = هدف التغطية × سرعة البيع − القابل للبيع.",
  });

  return {
    tabLabel: "المخزون",
    title: "تقرير المخزون",
    subtitle: `المصدر: قاعدة بيانات الإنتاج · هدف التغطية ${data.settings.targetCoverDays} يومًا · الراكد = بلا بيع ${data.settings.deadStockDays} يومًا`,
    periodLabel,
    generatedAtLabel,
    tiles: [
      { label: sellable.label, value: formatCount(sellable.value) },
      { label: valuationCost.label, value: formatMoney2(valuationCost.value) },
      { label: medianCover.label, value: medianCover.value === 0 ? "∞" : `${formatCount(Math.round(medianCover.value))} يوم` },
      { label: deadStockCount.label, value: formatCount(deadStockCount.value) },
    ],
    tables,
    footnote: PERIOD_FOOTNOTE,
  };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
export function buildMoneyPrintData(data: MoneyReportResponse, periodLabel: string, generatedAtLabel: string): PrintPageInput {
  const byKey = new Map(data.headline.map((h) => [h.key, h]));
  const balance = byKey.get("balance")!;
  const collected = byKey.get("collectedInPeriod")!;
  const codPending = byKey.get("codPendingNow")!;
  const margin = byKey.get("marginEstimate")!;

  const tables: PrintTable[] = [];

  if (data.breakdowns.byPartner) {
    const rows = dropAllZeroRows(
      data.breakdowns.byPartner.rows,
      (r) => r.owedPiastres === 0 && r.paidAllTimePiastres === 0 && r.receivedAllTimePiastres === 0
    );
    tables.push({
      title: "حسب الشريك",
      columns: ["الشريك", "المتبقي عليه", "دفعاته وأقساطه", "المستلم منذ البداية"],
      rows: rows.map((r) => [cell(r.label), cell(formatMoney2(r.owedPiastres)), cell(formatMoney2(r.paidAllTimePiastres)), cell(formatMoney2(r.receivedAllTimePiastres))]),
      totalRow: [
        "الإجمالي",
        formatMoney2(rows.reduce((s, r) => s + r.owedPiastres, 0)),
        formatMoney2(rows.reduce((s, r) => s + r.paidAllTimePiastres, 0)),
        formatMoney2(rows.reduce((s, r) => s + r.receivedAllTimePiastres, 0)),
      ],
    });
  }

  // --- استلامات المصنع: mirrors the on-screen column order (partner?, المرجع, التاريخ,
  // القطع, القيمة) — the print page had dropped التاريخ entirely; restored. ---
  const receiptRows = data.breakdowns.receipts.rows;
  const receiptsHasPartner = receiptRows.some((r) => r.partnerName);
  tables.push({
    title: "استلامات المصنع",
    columns: receiptsHasPartner ? ["الشريك", "المرجع", "التاريخ", "القطع", "القيمة بنسبتك"] : ["المرجع", "التاريخ", "القطع", "القيمة بنسبتك"],
    rows: receiptRows.map((r) => {
      const base = [cell(r.reference ?? "—"), cell(r.createdAt.slice(0, 10)), cell(formatCount(r.units)), cell(formatMoney2(r.totalCostPiastres))];
      return r.partnerName ? [cell(r.partnerName), ...base] : base;
    }),
    totalRow: receiptsHasPartner
      ? ["", "الإجمالي", "", formatCount(receiptRows.reduce((s, r) => s + r.units, 0)), formatMoney2(receiptRows.reduce((s, r) => s + r.totalCostPiastres, 0))]
      : ["الإجمالي", "", formatCount(receiptRows.reduce((s, r) => s + r.units, 0)), formatMoney2(receiptRows.reduce((s, r) => s + r.totalCostPiastres, 0))],
  });

  // --- الدفعات المقدمة والأقساط: mirrors the on-screen column order (partner?, التاريخ,
  // المبلغ, المرجع) — the print page had dropped التاريخ and المرجع and shown only "النوع"
  // where the screen shows the type folded into the reference cell; restored. ---
  const paymentRows = data.breakdowns.payments.rows;
  const paymentsHasPartner = paymentRows.some((r) => r.partnerName);
  tables.push({
    title: "الدفعات المقدمة والأقساط",
    columns: paymentsHasPartner ? ["الشريك", "التاريخ", "المبلغ", "المرجع"] : ["التاريخ", "المبلغ", "المرجع"],
    rows: paymentRows.map((r) => {
      const kindLabel = r.kind === "DOWN_PAYMENT" ? "دفعة مقدمة" : "قسط";
      const refText = r.reference ? `${kindLabel} · ${r.reference}` : r.stockReceiptReference ? `${kindLabel} · ${r.stockReceiptReference}` : kindLabel;
      const base = [cell(r.paidAt.slice(0, 10)), cell(formatMoney2(r.amountPiastres)), cell(refText)];
      return r.partnerName ? [cell(r.partnerName), ...base] : base;
    }),
    totalRow: paymentsHasPartner
      ? ["", "", formatMoney2(paymentRows.reduce((s, r) => s + r.amountPiastres, 0)), ""]
      : ["", formatMoney2(paymentRows.reduce((s, r) => s + r.amountPiastres, 0)), ""],
  });

  const methodRows = dropAllZeroRows(data.breakdowns.collectedByMethod.rows, (r) => r.orderCount === 0 && r.amountPiastres === 0);
  tables.push({
    title: "التحصيل حسب طريقة الدفع",
    columns: ["الطريقة", "الطلبات", "المبلغ"],
    rows: methodRows.map((r) => [cell(PAYMENT_METHOD_LABELS[r.key] ?? r.label), cell(formatCount(r.orderCount)), cell(formatMoney2(r.amountPiastres))]),
    totalRow: [
      "الإجمالي",
      formatCount(methodRows.reduce((s, r) => s + r.orderCount, 0)),
      formatMoney2(methodRows.reduce((s, r) => s + r.amountPiastres, 0)),
    ],
  });

  return {
    tabLabel: "المال",
    title: "تقرير المال",
    subtitle: `المصدر: قاعدة بيانات الإنتاج · نسبة تكلفتك ${data.costRatePct}% من سعر البيع`,
    periodLabel,
    generatedAtLabel,
    tiles: [
      { label: balance.label, value: formatMoney2(balance.value), hint: balance.hint },
      { label: collected.label, value: formatMoney2(collected.value), hint: collected.hint },
      { label: codPending.label, value: formatMoney2(codPending.value), hint: codPending.hint },
      { label: margin.label, value: formatMoney2(margin.value), hint: margin.hint },
    ],
    tables,
    footnote: PERIOD_FOOTNOTE,
  };
}
