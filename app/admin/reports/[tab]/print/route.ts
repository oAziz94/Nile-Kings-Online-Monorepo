import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { apiForbidden, apiUnauthorized, apiBadRequest } from "@/lib/api/response";
import { getPartnerSalesReport, type SalesOrderSet } from "@/lib/analytics/partner-sales-report";
import { getPartnerFulfilmentReport } from "@/lib/analytics/partner-fulfilment-report";
import { getPartnerInventoryReport } from "@/lib/analytics/partner-inventory-report";
import { getPartnerMoneyReport } from "@/lib/analytics/partner-money-report";
import type { SalesReportPreset, InventoryReportPreset, MoneyReportPreset } from "@/lib/analytics/partner-reports";
import { formatDateEn } from "@/lib/format-en-numbers";
import { renderReportPrintPage } from "@/lib/reports/print/render";
import { buildSalesPrintData, buildFulfilmentPrintData, buildInventoryPrintData, buildMoneyPrintData } from "@/lib/reports/print/build";

/**
 * `GET /admin/reports/<tab>/print` (backlog 10.14) — a plain server-rendered HTML page (no
 * React hydration, no client fetch), opened in a new tab by the «PDF» button next to each
 * admin report tab's CSV export. Deliberately outside the `app/(admin)` route group: the print
 * page has its own toolbar («طباعة / حفظ PDF», «إغلاق»), never the `AdminShell` sidebar, and
 * authenticates the same way the admin API routes do — `requireAdmin()`, 401/403 on failure —
 * rather than the admin layout's redirect-to-login behaviour.
 *
 * `?preset=&from=&to=&orders=` are the same params the tab's own state carries; the print page
 * calls the exact report function the tab's API route calls, at `{ network: true }` scope (the
 * admin's four top-nav report tabs are always network-wide — no per-partner print route here).
 */

const TAB_LABELS: Record<string, string> = {
  sales: "المبيعات",
  fulfilment: "التجهيز",
  inventory: "المخزون",
  money: "المال",
};

const SALES_PRESETS: SalesReportPreset[] = ["today", "7d", "30d", "month", "lastMonth", "custom"];
const INVENTORY_PRESETS: InventoryReportPreset[] = ["7d", "30d", "90d", "custom"];
const MONEY_PRESETS: MoneyReportPreset[] = ["month", "lastMonth", "90d", "allTime", "custom"];
const ORDER_SETS: SalesOrderSet[] = ["accomplished", "active"];

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params;
  if (!(tab in TAB_LABELS)) {
    return apiBadRequest(`tab يجب أن يكون أحد: ${Object.keys(TAB_LABELS).join(", ")}`);
  }

  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const scope = { network: true as const };
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const now = new Date();
  const generatedAtLabel = `${formatDateEn(now)} ${now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;

  if (tab === "sales") {
    const presetParam = searchParams.get("preset") ?? "30d";
    if (!SALES_PRESETS.includes(presetParam as SalesReportPreset)) {
      return apiBadRequest(`preset يجب أن يكون أحد: ${SALES_PRESETS.join(", ")}`);
    }
    const ordersParam = searchParams.get("orders") ?? "accomplished";
    if (!ORDER_SETS.includes(ordersParam as SalesOrderSet)) {
      return apiBadRequest(`orders يجب أن يكون أحد: ${ORDER_SETS.join(", ")}`);
    }
    const orderSet = ordersParam as SalesOrderSet;
    const report = await getPartnerSalesReport(scope, { preset: presetParam as SalesReportPreset, from, to, page: 1, orderSet });
    const periodLabel = `الفترة: ${formatDateEn(report.period.current.from)} إلى ${formatDateEn(report.period.current.to)}`;
    const html = renderReportPrintPage(buildSalesPrintData(report, orderSet, periodLabel, generatedAtLabel));
    return htmlResponse(html);
  }

  if (tab === "fulfilment") {
    const presetParam = searchParams.get("preset") ?? "30d";
    if (!SALES_PRESETS.includes(presetParam as SalesReportPreset)) {
      return apiBadRequest(`preset يجب أن يكون أحد: ${SALES_PRESETS.join(", ")}`);
    }
    const report = await getPartnerFulfilmentReport(scope, { preset: presetParam as SalesReportPreset, from, to, page: 1 });
    const periodLabel = `الفترة: ${formatDateEn(report.period.current.from)} إلى ${formatDateEn(report.period.current.to)}`;
    const html = renderReportPrintPage(buildFulfilmentPrintData(report, periodLabel, generatedAtLabel));
    return htmlResponse(html);
  }

  if (tab === "inventory") {
    const presetParam = searchParams.get("preset") ?? "30d";
    if (!INVENTORY_PRESETS.includes(presetParam as InventoryReportPreset)) {
      return apiBadRequest(`preset يجب أن يكون أحد: ${INVENTORY_PRESETS.join(", ")}`);
    }
    const report = await getPartnerInventoryReport(scope, { preset: presetParam as InventoryReportPreset, from, to, page: 1, filter: "all" });
    const periodLabel = `الفترة: ${formatDateEn(report.period.current.from)} إلى ${formatDateEn(report.period.current.to)}`;
    const html = renderReportPrintPage(buildInventoryPrintData(report, periodLabel, generatedAtLabel));
    return htmlResponse(html);
  }

  // money
  const presetParam = searchParams.get("preset") ?? "month";
  if (!MONEY_PRESETS.includes(presetParam as MoneyReportPreset)) {
    return apiBadRequest(`preset يجب أن يكون أحد: ${MONEY_PRESETS.join(", ")}`);
  }
  const report = await getPartnerMoneyReport(scope, { preset: presetParam as MoneyReportPreset, from, to, page: 1 });
  const periodLabel = `الفترة: ${formatDateEn(report.period.current.from)} إلى ${formatDateEn(report.period.current.to)}`;
  const html = renderReportPrintPage(buildMoneyPrintData(report, periodLabel, generatedAtLabel));
  return htmlResponse(html);
}
