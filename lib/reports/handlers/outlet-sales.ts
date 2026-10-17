import { NextRequest } from "next/server";
import { apiBadRequest, apiSuccess } from "@/lib/api/response";
import {
  getOutletSalesFullBreakdown,
  getOutletSalesReport,
  OUTLET_BREAKDOWN_KEYS,
  type OutletSalesBreakdownKey,
} from "@/lib/analytics/outlet-sales-report";
import type { SalesReportPreset } from "@/lib/analytics/partner-reports";
import { PAYMENT_METHOD_LABELS } from "@/lib/sales/format";

/**
 * Body of `GET /api/partner/reports/sales` for a DISTRIBUTOR (backlog 11.5), called from
 * `handleSalesReport` once it sees the partner is an outlet. Same presets and `format=csv`
 * export pattern as the agent handler; `breakdown` is one of the outlet keys.
 */
const PRESETS: SalesReportPreset[] = ["today", "7d", "30d", "month", "lastMonth", "custom"];

function escapeCsv(s: string | number): string {
  const str = String(s);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function outletRowsToCsv(key: OutletSalesBreakdownKey, rows: unknown[]): string {
  const line = (cells: (string | number)[]) => cells.map(escapeCsv).join(",");
  if (key === "product") {
    const lines = ["Product,Slug,Units,Revenue (piastres),Previous Revenue (piastres),Revenue Share %,Receipts"];
    for (const r of rows as { productName: string; productSlug: string | null; units: number; revenuePiastres: number; previousRevenuePiastres: number; revenueSharePct: number; receiptCount: number }[]) {
      lines.push(line([r.productName, r.productSlug ?? "", r.units, r.revenuePiastres, r.previousRevenuePiastres, r.revenueSharePct.toFixed(1), r.receiptCount]));
    }
    return lines.join("\n");
  }
  if (key === "payment") {
    const lines = ["Payment method,Receipts,Revenue (piastres),Previous Revenue (piastres),Revenue Share %"];
    for (const r of rows as { key: keyof typeof PAYMENT_METHOD_LABELS; receiptCount: number; revenuePiastres: number; previousRevenuePiastres: number; revenueSharePct: number }[]) {
      lines.push(line([r.key, r.receiptCount, r.revenuePiastres, r.previousRevenuePiastres, r.revenueSharePct.toFixed(1)]));
    }
    return lines.join("\n");
  }
  if (key === "size" || key === "colour") {
    const lines = [`${key === "size" ? "Size" : "Colour"},Units,Revenue (piastres),Revenue Share %`];
    for (const r of rows as { label: string; units: number; revenuePiastres: number; revenueSharePct: number }[]) {
      lines.push(line([r.label, r.units, r.revenuePiastres, r.revenueSharePct.toFixed(1)]));
    }
    return lines.join("\n");
  }
  if (key === "day") {
    const lines = ["Date,Receipts,Units,Revenue (piastres)"];
    for (const r of rows as { date: string; receiptCount: number; units: number; revenuePiastres: number }[]) {
      lines.push(line([r.date, r.receiptCount, r.units, r.revenuePiastres]));
    }
    return lines.join("\n");
  }
  const lines = ["Hour,Receipts,Revenue (piastres)"];
  for (const r of rows as { label: string; receiptCount: number; revenuePiastres: number }[]) {
    lines.push(line([r.label, r.receiptCount, r.revenuePiastres]));
  }
  return lines.join("\n");
}

export async function handleOutletSalesReport(req: NextRequest, partnerId: string): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const presetParam = searchParams.get("preset") ?? "30d";
  if (!PRESETS.includes(presetParam as SalesReportPreset)) {
    return apiBadRequest(`preset يجب أن يكون أحد: ${PRESETS.join(", ")}`);
  }
  const preset = presetParam as SalesReportPreset;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1") || 1;

  if (searchParams.get("format") === "csv") {
    const breakdown = searchParams.get("breakdown");
    if (!breakdown || !OUTLET_BREAKDOWN_KEYS.includes(breakdown as OutletSalesBreakdownKey)) {
      return apiBadRequest(`breakdown يجب أن يكون أحد: ${OUTLET_BREAKDOWN_KEYS.join(", ")}`);
    }
    const key = breakdown as OutletSalesBreakdownKey;
    const rows = await getOutletSalesFullBreakdown(partnerId, { preset, from, to }, key);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(`﻿${outletRowsToCsv(key, rows)}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="outlet-sales-${key}-${stamp}.csv"`,
      },
    });
  }

  return apiSuccess(await getOutletSalesReport(partnerId, { preset, from, to, page }));
}
