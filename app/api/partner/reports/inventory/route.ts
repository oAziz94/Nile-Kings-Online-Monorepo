import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import {
  buildReorderCsv,
  getPartnerInventoryReport,
  getPartnerReorderRows,
  type InventoryReportFilter,
} from "@/lib/analytics/partner-inventory-report";
import type { InventoryReportPreset } from "@/lib/analytics/partner-reports";

const PRESETS: InventoryReportPreset[] = ["7d", "30d", "90d", "custom"];
const FILTERS: InventoryReportFilter[] = ["needsReorder", "dead", "all"];

/**
 * GET /api/partner/reports/inventory (backlog 5.6a). `?export=reorder` streams the reorder
 * list as a CSV in the factory intake format (`buildReorderCsv`) instead of the JSON report.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requirePartner();
    const { searchParams } = new URL(req.url);
    const presetParam = searchParams.get("preset") ?? "30d";
    if (!PRESETS.includes(presetParam as InventoryReportPreset)) {
      return apiBadRequest(`preset يجب أن يكون أحد: ${PRESETS.join(", ")}`);
    }
    const preset = presetParam as InventoryReportPreset;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const page = Number(searchParams.get("page") ?? "1") || 1;
    const filterParam = searchParams.get("filter") ?? "all";
    if (!FILTERS.includes(filterParam as InventoryReportFilter)) {
      return apiBadRequest(`filter يجب أن يكون أحد: ${FILTERS.join(", ")}`);
    }
    const filter = filterParam as InventoryReportFilter;

    if (searchParams.get("export") === "reorder") {
      const [allRows, partner] = await Promise.all([
        getPartnerReorderRows(user.partnerId, { preset, from, to }),
        prisma.partner.findUniqueOrThrow({ where: { id: user.partnerId }, select: { lowStockThreshold: true } }),
      ]);
      const csv = buildReorderCsv(allRows, partner.lowStockThreshold);
      const stamp = new Date().toISOString().slice(0, 10);
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="partner-reorder-${stamp}.csv"`,
        },
      });
    }

    const report = await getPartnerInventoryReport(user.partnerId, { preset, from, to, page, filter });
    return apiSuccess(report);
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
