import { NextRequest } from "next/server";
import { apiBadRequest, apiSuccess } from "@/lib/api/response";
import { getPartnerFulfilmentReport } from "@/lib/analytics/partner-fulfilment-report";
import type { ReportScope, SalesReportPreset } from "@/lib/analytics/partner-reports";

/**
 * Shared body of `GET /api/partner/reports/fulfilment`, `GET /api/admin/partners/[id]/reports/fulfilment`
 * and `GET /api/admin/reports/fulfilment` (backlog 9.4b (a), 9.6 (a)/(b), B3).
 */
const PRESETS: SalesReportPreset[] = ["today", "7d", "30d", "month", "lastMonth", "custom"];

export async function handleFulfilmentReport(req: NextRequest, scope: ReportScope): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const presetParam = searchParams.get("preset") ?? "30d";
  if (!PRESETS.includes(presetParam as SalesReportPreset)) {
    return apiBadRequest(`preset يجب أن يكون أحد: ${PRESETS.join(", ")}`);
  }
  const preset = presetParam as SalesReportPreset;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1") || 1;

  const report = await getPartnerFulfilmentReport(scope, { preset, from, to, page });
  return apiSuccess(report);
}
