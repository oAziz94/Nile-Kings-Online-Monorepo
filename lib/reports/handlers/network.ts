import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess } from "@/lib/api/response";
import { getPartnerNetworkReport } from "@/lib/analytics/partner-network-report";
import type { SalesReportPreset } from "@/lib/analytics/partner-reports";

/**
 * Shared body of `GET /api/partner/reports/network` and `GET /api/admin/partners/[id]/reports/network`
 * (backlog 9.4b (a), B3) — AGENT only. The partner route keeps its own 403 ("هذه الصفحة متاحة
 * للوكلاء فقط") via the check below; the admin route additionally pre-checks the target
 * partner's type itself and answers 400 for a non-agent target (per the task text) before
 * ever calling this handler, so a distributor id never reaches the 403 branch from the admin
 * side.
 */
const PRESETS: SalesReportPreset[] = ["today", "7d", "30d", "month", "lastMonth", "custom"];

export async function handleNetworkReport(req: NextRequest, partnerId: string): Promise<Response> {
  const partner = await prisma.partner.findUnique({ where: { id: partnerId }, select: { partnerType: true } });
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

  const report = await getPartnerNetworkReport(partnerId, { preset, from, to, page });
  return apiSuccess(report);
}
