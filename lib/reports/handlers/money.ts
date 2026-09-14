import { NextRequest } from "next/server";
import { apiBadRequest, apiSuccess } from "@/lib/api/response";
import { buildStatementCsv, getPartnerMoneyReport, getPartnerStatementRows } from "@/lib/analytics/partner-money-report";
import type { MoneyReportPreset } from "@/lib/analytics/partner-reports";

/**
 * Shared body of `GET /api/partner/reports/money` and `GET /api/admin/partners/[id]/reports/money`
 * (backlog 9.4b (a), B3). `?export=statement` streams the full receipts+payments ledger as a
 * CSV ("كشف حساب") regardless of the table's own page size.
 */
const PRESETS: MoneyReportPreset[] = ["month", "lastMonth", "90d", "allTime", "custom"];

export async function handleMoneyReport(req: NextRequest, partnerId: string): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const presetParam = searchParams.get("preset") ?? "month";
  if (!PRESETS.includes(presetParam as MoneyReportPreset)) {
    return apiBadRequest(`preset يجب أن يكون أحد: ${PRESETS.join(", ")}`);
  }
  const preset = presetParam as MoneyReportPreset;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1") || 1;

  if (searchParams.get("export") === "statement") {
    const { receipts, payments } = await getPartnerStatementRows(partnerId);
    const csv = buildStatementCsv(receipts, payments);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="partner-statement-${stamp}.csv"`,
      },
    });
  }

  const report = await getPartnerMoneyReport(partnerId, { preset, from, to, page });
  return apiSuccess(report);
}
