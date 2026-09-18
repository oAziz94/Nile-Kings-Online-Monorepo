/**
 * Backlog 10.14 — per-tab adapters from a report response (the same shape the on-screen tab
 * and its API route render) to the generic `PrintPageInput` the HTML renderer consumes. Reuses
 * the exact report functions the API handlers call (`getPartnerSalesReport` etc.) — never a
 * second computation of the numbers.
 */
import type { PrintPageInput, PrintTable, PrintTableCell } from "./render";
import type { SalesReportResponse, SalesOrderSet } from "@/lib/analytics/partner-sales-report";
import type { FulfilmentReportResponse } from "@/lib/analytics/partner-fulfilment-report";
import type { InventoryReportResponse } from "@/lib/analytics/partner-inventory-report";
import type { MoneyReportResponse } from "@/lib/analytics/partner-money-report";
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

function shareCell(text: string, sharePct: number): PrintTableCell {
  return { text, sharePct };
}

const ORDER_SET_LABEL: Record<SalesOrderSet, string> = {
  accomplished: "الطلبات المُسلَّمة فقط",
  active: "الطلبات النشطة (مؤكدة حتى تم الشحن)",
};

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

  if (data.breakdowns.byPartner) {
    const rows = data.breakdowns.byPartner.rows;
    tables.push({
      title: "حسب الشريك",
      columns: ["الشريك", "الإيراد", "الطلبات", "نسبة الإلغاء"],
      rows: rows.map((r) => [cell(r.label), cell(formatMoney2(r.revenuePiastres)), cell(formatCount(r.orderCount)), cell(formatPct1(r.cancellationRatePct))]),
      totalRow: [
        "الإجمالي",
        formatMoney2(rows.reduce((s, r) => s + r.revenuePiastres, 0)),
        formatCount(rows.reduce((s, r) => s + r.orderCount, 0)),
        "",
      ],
    });
  }

  const productRows = data.breakdowns.product.rows;
  tables.push({
    title: "حسب المنتج",
    columns: ["المنتج", "القطع", "الإيراد", "حصة الإيراد"],
    rows: productRows.map((r) => [cell(r.productName), cell(formatCount(r.units)), cell(formatMoney2(r.revenuePiastres)), shareCell(formatPct1(r.revenueSharePct), r.revenueSharePct)]),
    totalRow: [
      "الإجمالي",
      formatCount(productRows.reduce((s, r) => s + r.units, 0)),
      formatMoney2(productRows.reduce((s, r) => s + r.revenuePiastres, 0)),
      "100.0%",
    ],
    note: "قد يختلف مجموع هذا العمود عن قيمة الإيراد بكسر قرش بسبب توزيع الخصم على كل صنف.",
  });

  const categoryRows = data.breakdowns.category.rows;
  tables.push({
    title: "حسب الفئة",
    columns: ["الفئة", "القطع", "الإيراد", "الطلبات"],
    rows: categoryRows.map((r) => [cell(r.label), cell(formatCount(r.units)), cell(formatMoney2(r.revenuePiastres)), cell(formatCount(r.orderCount))]),
    totalRow: [
      "الإجمالي",
      formatCount(categoryRows.reduce((s, r) => s + r.units, 0)),
      formatMoney2(categoryRows.reduce((s, r) => s + r.revenuePiastres, 0)),
      formatCount(categoryRows.reduce((s, r) => s + r.orderCount, 0)),
    ],
  });

  const govRows = data.breakdowns.governorate.rows;
  tables.push({
    title: "حسب المحافظة",
    columns: ["المحافظة", "الإيراد", "الطلبات", "نسبة الإلغاء"],
    rows: govRows.map((r) => [cell(r.label), cell(formatMoney2(r.revenuePiastres)), cell(formatCount(r.orderCount)), cell(formatPct1(r.cancellationRatePct))]),
    totalRow: [
      "الإجمالي",
      formatMoney2(govRows.reduce((s, r) => s + r.revenuePiastres, 0)),
      formatCount(govRows.reduce((s, r) => s + r.orderCount, 0)),
      "",
    ],
  });

  const paymentRows = data.breakdowns.payment.rows;
  tables.push({
    title: "حسب طريقة الدفع",
    columns: ["طريقة الدفع", "الإيراد", "الطلبات"],
    rows: paymentRows.map((r) => [cell(r.label), cell(formatMoney2(r.revenuePiastres)), cell(formatCount(r.orderCount))]),
    totalRow: ["الإجمالي", formatMoney2(paymentRows.reduce((s, r) => s + r.revenuePiastres, 0)), formatCount(paymentRows.reduce((s, r) => s + r.orderCount, 0))],
  });

  const dayRows = data.breakdowns.day.rows;
  tables.push({
    title: "حسب اليوم",
    columns: ["اليوم", "الإيراد", "الطلبات"],
    rows: dayRows.map((r) => [cell(r.date), cell(formatMoney2(r.revenuePiastres)), cell(formatCount(r.orderCount))]),
    totalRow: ["الإجمالي", formatMoney2(dayRows.reduce((s, r) => s + r.revenuePiastres, 0)), formatCount(dayRows.reduce((s, r) => s + r.orderCount, 0))],
  });

  return {
    tabLabel: "المبيعات",
    title: "تقرير المبيعات",
    subtitle: `المصدر: تقرير المبيعات الشبكي · النطاق: ${ORDER_SET_LABEL[orderSet]} · لا تشمل نسبة الإلغاء (${formatPct1(cancellationRate.value)}) — تُحسب من كل الطلبات في الفترة بلا فلترة`,
    periodLabel,
    generatedAtLabel,
    tiles: [
      { label: revenue.label, value: formatMoney2(revenue.value), hint: revenue.hint },
      { label: orders.label, value: formatCount(orders.value) },
      { label: units.label, value: formatCount(units.value) },
      { label: averageOrder.label, value: formatMoney2(averageOrder.value) },
    ],
    tables,
    footnote: "لا تشمل القيم الشحن ولا رسوم الدفع عند الاستلام.",
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
    const rows = data.breakdowns.byPartner.rows;
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

  const reasonRows = data.breakdowns.cancellationReason.rows;
  tables.push({
    title: "أسباب الإلغاء",
    columns: ["السبب", "العدد"],
    rows: reasonRows.map((r) => [cell(r.label), cell(formatCount(r.count))]),
    totalRow: ["الإجمالي", formatCount(reasonRows.reduce((s, r) => s + r.count, 0))],
  });

  return {
    tabLabel: "التجهيز",
    title: "تقرير التجهيز",
    subtitle: `المصدر: تقرير التجهيز الشبكي · نسبة الإلغاء ${formatPct1(cancellation.value)} من كل الطلبات في الفترة`,
    periodLabel,
    generatedAtLabel,
    tiles: [
      { label: confirm.label, value: `${confirm.value.toFixed(1)} ساعة` },
      { label: ship.label, value: `${ship.value.toFixed(1)} ساعة` },
      { label: overdue.label, value: formatPct1(overdue.value) },
      { label: delivered.label, value: formatPct1(delivered.value) },
    ],
    tables,
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
    const rows = data.breakdowns.byPartner.rows;
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
    subtitle: `المصدر: تقرير المخزون الشبكي · هدف التغطية ${data.settings.targetCoverDays} يومًا · الراكد = بلا بيع ${data.settings.deadStockDays} يومًا`,
    periodLabel,
    generatedAtLabel,
    tiles: [
      { label: sellable.label, value: formatCount(sellable.value) },
      { label: valuationCost.label, value: formatMoney2(valuationCost.value) },
      { label: medianCover.label, value: medianCover.value === 0 ? "∞" : `${formatCount(Math.round(medianCover.value))} يوم` },
      { label: deadStockCount.label, value: formatCount(deadStockCount.value) },
    ],
    tables,
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
    const rows = data.breakdowns.byPartner.rows;
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

  const receiptRows = data.breakdowns.receipts.rows;
  tables.push({
    title: "استلامات المصنع",
    columns: receiptRows.some((r) => r.partnerName) ? ["الشريك", "المرجع", "القطع", "القيمة بنسبتك"] : ["المرجع", "القطع", "القيمة بنسبتك"],
    rows: receiptRows.map((r) => {
      const base = [cell(r.reference ?? "—"), cell(formatCount(r.units)), cell(formatMoney2(r.totalCostPiastres))];
      return r.partnerName ? [cell(r.partnerName), ...base] : base;
    }),
    totalRow: receiptRows.some((r) => r.partnerName)
      ? ["", "الإجمالي", formatCount(receiptRows.reduce((s, r) => s + r.units, 0)), formatMoney2(receiptRows.reduce((s, r) => s + r.totalCostPiastres, 0))]
      : ["الإجمالي", formatCount(receiptRows.reduce((s, r) => s + r.units, 0)), formatMoney2(receiptRows.reduce((s, r) => s + r.totalCostPiastres, 0))],
  });

  const paymentRows = data.breakdowns.payments.rows;
  tables.push({
    title: "الدفعات المقدمة والأقساط",
    columns: paymentRows.some((r) => r.partnerName) ? ["الشريك", "المبلغ", "النوع"] : ["المبلغ", "النوع"],
    rows: paymentRows.map((r) => {
      const base = [cell(formatMoney2(r.amountPiastres)), cell(r.kind === "DOWN_PAYMENT" ? "دفعة مقدمة" : "قسط")];
      return r.partnerName ? [cell(r.partnerName), ...base] : base;
    }),
    totalRow: paymentRows.some((r) => r.partnerName)
      ? ["", "الإجمالي", formatMoney2(paymentRows.reduce((s, r) => s + r.amountPiastres, 0)), ""]
      : ["الإجمالي", formatMoney2(paymentRows.reduce((s, r) => s + r.amountPiastres, 0)), ""],
  });

  const methodRows = data.breakdowns.collectedByMethod.rows;
  tables.push({
    title: "التحصيل حسب طريقة الدفع",
    columns: ["الطريقة", "المبلغ", "الطلبات"],
    rows: methodRows.map((r) => [cell(r.label), cell(formatMoney2(r.amountPiastres)), cell(formatCount(r.orderCount))]),
    totalRow: ["الإجمالي", formatMoney2(methodRows.reduce((s, r) => s + r.amountPiastres, 0)), formatCount(methodRows.reduce((s, r) => s + r.orderCount, 0))],
  });

  return {
    tabLabel: "المال",
    title: "تقرير المال",
    subtitle: `المصدر: تقرير المال الشبكي · نسبة تكلفتك ${data.costRatePct}% من سعر البيع`,
    periodLabel,
    generatedAtLabel,
    tiles: [
      { label: balance.label, value: formatMoney2(balance.value), hint: balance.hint },
      { label: collected.label, value: formatMoney2(collected.value), hint: collected.hint },
      { label: codPending.label, value: formatMoney2(codPending.value), hint: codPending.hint },
      { label: margin.label, value: formatMoney2(margin.value), hint: margin.hint },
    ],
    tables,
  };
}

