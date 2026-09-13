import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { getPartnerSalesFullBreakdown, getPartnerSalesReport } from "@/lib/analytics/partner-sales-report";
import type { SalesReportPreset } from "@/lib/analytics/partner-reports";

const PRESETS: SalesReportPreset[] = ["today", "7d", "30d", "month", "lastMonth", "custom"];
const BREAKDOWN_KEYS = ["product", "category", "governorate", "payment", "day"] as const;

function escapeCsv(s: string | number): string {
  const str = String(s);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function rowsToCsv(key: string, rows: unknown[]): string {
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
    const lines = ["Governorate,Revenue (piastres),Orders,Cancellation Rate %"];
    for (const r of rows as { label: string; revenuePiastres: number; orderCount: number; cancellationRatePct: number }[]) {
      lines.push([r.label, r.revenuePiastres, r.orderCount, r.cancellationRatePct.toFixed(1)].map(escapeCsv).join(","));
    }
    return lines.join("\n");
  }
  // category / payment share the same simple shape.
  const lines = ["Label,Revenue (piastres),Orders"];
  for (const r of rows as { label: string; revenuePiastres: number; orderCount: number }[]) {
    lines.push([r.label, r.revenuePiastres, r.orderCount].map(escapeCsv).join(","));
  }
  return lines.join("\n");
}

export async function GET(req: NextRequest) {
  try {
    const user = await requirePartner();
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

    if (format === "csv") {
      if (!breakdown || !BREAKDOWN_KEYS.includes(breakdown as (typeof BREAKDOWN_KEYS)[number])) {
        return apiBadRequest(`breakdown يجب أن يكون أحد: ${BREAKDOWN_KEYS.join(", ")}`);
      }
      const rows = await getPartnerSalesFullBreakdown(user.partnerId, { preset, from, to }, breakdown as (typeof BREAKDOWN_KEYS)[number]);
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

    const report = await getPartnerSalesReport(user.partnerId, { preset, from, to, page });
    return apiSuccess(report);
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
