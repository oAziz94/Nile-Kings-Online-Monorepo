import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiSuccess } from "@/lib/api/response";
import {
  buildReorderCsv,
  getPartnerInventoryReport,
  getPartnerReorderRows,
  type InventoryReportFilter,
} from "@/lib/analytics/partner-inventory-report";
import { isNetworkScope, type ReportScope, type InventoryReportPreset } from "@/lib/analytics/partner-reports";

/**
 * Shared body of `GET /api/partner/reports/inventory`, `GET /api/admin/partners/[id]/reports/inventory`
 * and `GET /api/admin/reports/inventory` (backlog 9.4b (a), 9.6 (a)/(b), B3). `?export=reorder`
 * streams the reorder list as a CSV in the factory intake format instead of the JSON report —
 * partner-scoped only (a network-wide reorder list spans partners with different lowStockThreshold
 * settings and factory relationships, out of this task's scope; the network route answers 400).
 */
const PRESETS: InventoryReportPreset[] = ["7d", "30d", "90d", "custom"];
const FILTERS: InventoryReportFilter[] = ["needsReorder", "dead", "all"];

export async function handleInventoryReport(req: NextRequest, scope: ReportScope): Promise<Response> {
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
    if (isNetworkScope(scope)) {
      return apiBadRequest("تصدير إعادة الطلب غير متاح على مستوى الشبكة — افتح ملف الشريك");
    }
    const [allRows, partner] = await Promise.all([
      getPartnerReorderRows(scope.partnerId, { preset, from, to }),
      prisma.partner.findUniqueOrThrow({ where: { id: scope.partnerId }, select: { lowStockThreshold: true } }),
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

  const report = await getPartnerInventoryReport(scope, { preset, from, to, page, filter });
  return apiSuccess(report);
}
