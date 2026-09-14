import { NextRequest } from "next/server";
import { apiBadRequest, apiSuccess } from "@/lib/api/response";
import { buildStatementCsv, getPartnerMoneyReport, getPartnerStatementRows } from "@/lib/analytics/partner-money-report";
import { isNetworkScope, type ReportScope, type MoneyReportPreset } from "@/lib/analytics/partner-reports";

/**
 * Shared body of `GET /api/partner/reports/money`, `GET /api/admin/partners/[id]/reports/money`
 * and `GET /api/admin/reports/money` (backlog 9.4b (a), 9.6 (a)/(b), B3). `?export=statement`
 * streams the full receipts+payments ledger as a CSV ("كشف حساب") regardless of the table's
 * own page size — partner-scoped only, per the network money report's own doc comment.
 */
const PRESETS: MoneyReportPreset[] = ["month", "lastMonth", "90d", "allTime", "custom"];

export async function handleMoneyReport(req: NextRequest, scope: ReportScope): Promise<Response> {
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
    if (isNetworkScope(scope)) {
      return apiBadRequest("كشف الحساب غير متاح على مستوى الشبكة — افتح ملف الشريك");
    }
    const { receipts, payments } = await getPartnerStatementRows(scope.partnerId);
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

  const report = await getPartnerMoneyReport(scope, { preset, from, to, page });
  return apiSuccess(report);
}
