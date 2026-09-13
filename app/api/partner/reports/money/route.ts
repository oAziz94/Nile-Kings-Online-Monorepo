import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { buildStatementCsv, getPartnerMoneyReport, getPartnerStatementRows } from "@/lib/analytics/partner-money-report";
import type { MoneyReportPreset } from "@/lib/analytics/partner-reports";

/**
 * GET /api/partner/reports/money (backlog 5.6b). `?export=statement` streams the full
 * receipts+payments ledger as a CSV ("كشف حساب") regardless of the table's own page size.
 */
const PRESETS: MoneyReportPreset[] = ["month", "lastMonth", "90d", "allTime", "custom"];

export async function GET(req: NextRequest) {
  try {
    const user = await requirePartner();
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
      const { receipts, payments } = await getPartnerStatementRows(user.partnerId);
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

    const report = await getPartnerMoneyReport(user.partnerId, { preset, from, to, page });
    return apiSuccess(report);
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
