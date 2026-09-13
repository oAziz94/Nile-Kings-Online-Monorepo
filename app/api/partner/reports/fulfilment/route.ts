import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { getPartnerFulfilmentReport } from "@/lib/analytics/partner-fulfilment-report";
import type { SalesReportPreset } from "@/lib/analytics/partner-reports";

/** GET /api/partner/reports/fulfilment (backlog 5.6b) — shares the sales report's preset set. */
const PRESETS: SalesReportPreset[] = ["today", "7d", "30d", "month", "lastMonth", "custom"];

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

    const report = await getPartnerFulfilmentReport(user.partnerId, { preset, from, to, page });
    return apiSuccess(report);
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
