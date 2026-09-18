import { NextRequest } from "next/server";
import { apiBadRequest, apiSuccess } from "@/lib/api/response";
import { getPartnerSalesFullBreakdown, getPartnerSalesReport } from "@/lib/analytics/partner-sales-report";
import type { SalesOrderSet } from "@/lib/analytics/partner-sales-report";
import type { ReportScope, SalesReportPreset } from "@/lib/analytics/partner-reports";

/**
 * Shared body of `GET /api/partner/reports/sales` and `GET /api/admin/partners/[id]/reports/sales`
 * / `GET /api/admin/reports/sales` (backlog 9.4b (a), 9.6 (a)/(b), B3) — the routes differ only
 * in how the `ReportScope` is resolved (`requirePartner()` vs `requireAdmin()` + the `[id]`
 * param vs `requireAdmin()` + `{ network: true }`), never in this logic. Lifted verbatim from
 * the pre-9.4b `app/api/partner/reports/sales/route.ts` body.
 */

const PRESETS: SalesReportPreset[] = ["today", "7d", "30d", "month", "lastMonth", "custom"];
const BREAKDOWN_KEYS = ["byPartner", "product", "category", "governorate", "payment", "day"] as const;
const ORDER_SETS: SalesOrderSet[] = ["accomplished", "active"];

function escapeCsv(s: string | number): string {
  const str = String(s);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function rowsToCsv(key: string, rows: unknown[]): string {
  if (key === "byPartner") {
    const lines = ["Partner,Revenue (piastres),Previous Revenue (piastres),Orders,Cancellation Rate %"];
    for (const r of rows as { label: string; revenuePiastres: number; previousRevenuePiastres: number; orderCount: number; cancellationRatePct: number }[]) {
      lines.push(
        [r.label, r.revenuePiastres, r.previousRevenuePiastres, r.orderCount, r.cancellationRatePct.toFixed(1)].map(escapeCsv).join(",")
      );
    }
    return lines.join("\n");
  }
  if (key === "product") {
    const lines = ["Product,Units,Revenue (piastres),Previous Revenue (piastres),Revenue Share %"];
    for (const r of rows as { productName: string; units: number; revenuePiastres: number; previousRevenuePiastres: number; revenueSharePct: number }[]) {
      lines.push([r.productName, r.units, r.revenuePiastres, r.previousRevenuePiastres, r.revenueSharePct.toFixed(1)].map(escapeCsv).join(","));
    }
    return lines.join("\n");
  }
  if (key === "day") {
    const lines = ["Date,Revenue (piastres),Orders"];
    for (const r of rows as { date: string; revenuePiastres: number; orderCount: number }[]) {
      lines.push([r.date, r.revenuePiastres, r.orderCount].map(escapeCsv).join(","));
    }
    return lines.join("\n");
  }
  if (key === "governorate") {
    const lines = ["Governorate,Revenue (piastres),Previous Revenue (piastres),Orders,Cancellation Rate %"];
    for (const r of rows as { label: string; revenuePiastres: number; previousRevenuePiastres: number; orderCount: number; cancellationRatePct: number }[]) {
      lines.push(
        [r.label, r.revenuePiastres, r.previousRevenuePiastres, r.orderCount, r.cancellationRatePct.toFixed(1)].map(escapeCsv).join(",")
      );
    }
    return lines.join("\n");
  }
  // category / payment share the same simple shape.
  const lines = ["Label,Revenue (piastres),Previous Revenue (piastres),Orders"];
  for (const r of rows as { label: string; revenuePiastres: number; previousRevenuePiastres: number; orderCount: number }[]) {
    lines.push([r.label, r.revenuePiastres, r.previousRevenuePiastres, r.orderCount].map(escapeCsv).join(","));
  }
  return lines.join("\n");
}

export async function handleSalesReport(req: NextRequest, scope: ReportScope): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const presetParam = searchParams.get("preset") ?? "30d";
  if (!PRESETS.includes(presetParam as SalesReportPreset)) {
    return apiBadRequest(`preset يجب أن يكون أحد: ${PRESETS.join(", ")}`);
  }
  const preset = presetParam as SalesReportPreset;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const format = searchParams.get("format");
  const breakdown = searchParams.get("breakdown");
  const ordersParam = searchParams.get("orders") ?? "accomplished";
  if (!ORDER_SETS.includes(ordersParam as SalesOrderSet)) {
    return apiBadRequest(`orders يجب أن يكون أحد: ${ORDER_SETS.join(", ")}`);
  }
  const orderSet = ordersParam as SalesOrderSet;

  if (format === "csv") {
    if (!breakdown || !BREAKDOWN_KEYS.includes(breakdown as (typeof BREAKDOWN_KEYS)[number])) {
      return apiBadRequest(`breakdown يجب أن يكون أحد: ${BREAKDOWN_KEYS.join(", ")}`);
    }
    const rows = await getPartnerSalesFullBreakdown(scope, { preset, from, to, orderSet }, breakdown as (typeof BREAKDOWN_KEYS)[number]);
    const csv = rowsToCsv(breakdown, rows);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(`﻿${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="partner-sales-${breakdown}-${stamp}.csv"`,
      },
    });
  }

  const report = await getPartnerSalesReport(scope, { preset, from, to, page, orderSet });
  return apiSuccess(report);
}
