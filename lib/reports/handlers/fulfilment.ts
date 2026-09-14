import { NextRequest } from "next/server";
import { apiBadRequest, apiSuccess } from "@/lib/api/response";
import { getPartnerFulfilmentReport } from "@/lib/analytics/partner-fulfilment-report";
import type { SalesReportPreset } from "@/lib/analytics/partner-reports";

/**
 * Shared body of `GET /api/partner/reports/fulfilment` and
 * `GET /api/admin/partners/[id]/reports/fulfilment` (backlog 9.4b (a), B3).
 */
const PRESETS: SalesReportPreset[] = ["today", "7d", "30d", "month", "lastMonth", "custom"];

export async function handleFulfilmentReport(req: NextRequest, partnerId: string): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const presetParam = searchParams.get("preset") ?? "30d";
  if (!PRESETS.includes(presetParam as SalesReportPreset)) {
    return apiBadRequest(`preset يجب أن يكون أحد: ${PRESETS.join(", ")}`);
  }
  const preset = presetParam as SalesReportPreset;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1") || 1;

  const report = await getPartnerFulfilmentReport(partnerId, { preset, from, to, page });
  return apiSuccess(report);
}
