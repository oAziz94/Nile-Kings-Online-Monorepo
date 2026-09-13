import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { getPartnerNetworkReport } from "@/lib/analytics/partner-network-report";
import type { SalesReportPreset } from "@/lib/analytics/partner-reports";

/**
 * GET /api/partner/reports/network (backlog 5.6b) — AGENT only, same 403 gate as
 * `/api/partner/distributors` (backlog 5.5).
 */
const PRESETS: SalesReportPreset[] = ["today", "7d", "30d", "month", "lastMonth", "custom"];

export async function GET(req: NextRequest) {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({ where: { id: user.partnerId }, select: { partnerType: true } });
    if (partner?.partnerType !== "AGENT") {
      return apiForbidden("هذه الصفحة متاحة للوكلاء فقط");
    }

    const { searchParams } = new URL(req.url);
    const presetParam = searchParams.get("preset") ?? "30d";
    if (!PRESETS.includes(presetParam as SalesReportPreset)) {
      return apiBadRequest(`preset يجب أن يكون أحد: ${PRESETS.join(", ")}`);
    }
    const preset = presetParam as SalesReportPreset;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const page = Number(searchParams.get("page") ?? "1") || 1;

    const report = await getPartnerNetworkReport(user.partnerId, { preset, from, to, page });
    return apiSuccess(report);
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
