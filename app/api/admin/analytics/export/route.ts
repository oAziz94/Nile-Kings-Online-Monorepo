import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { apiUnauthorized, apiForbidden, apiBadRequest } from "@/lib/api/response";
import * as queries from "@/lib/analytics/queries";
import type { DateGranularity } from "@/lib/analytics/types";

function piastresToEgp(piastres: number): string {
  return (piastres / 100).toFixed(2);
}

function escapeCsvCell(s: string | number): string {
  const str = String(s);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function csvResponse(csv: string, filename: string): Response {
  return new Response(`\uFEFF${csv}`, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const report = searchParams.get("report");
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const granularity = (searchParams.get("granularity") ?? "day") as DateGranularity;

  if (!report) {
    return apiBadRequest("يجب تحديد نوع التقرير (summary | revenue | products)");
  }

  const stamp = new Date().toISOString().slice(0, 10);

  if (report === "summary") {
    const kpis = await queries.getKpis(from, to);
    const csv = [
      "Metric,Value (EGP),Orders,Period From,Period To",
      [
        "Total revenue (totalPiastres)",
        escapeCsvCell(piastresToEgp(kpis.totalRevenuePiastres)),
        escapeCsvCell(kpis.orderCount),
        escapeCsvCell(kpis.period.from.toISOString().slice(0, 10)),
        escapeCsvCell(kpis.period.to.toISOString().slice(0, 10)),
      ].join(","),
      [
        "Net merchandise (excl. shipping & COD)",
        escapeCsvCell(piastresToEgp(kpis.netMerchandisePiastres)),
        "",
        "",
        "",
      ].join(","),
    ].join("\n");
    return csvResponse(csv, `analytics-summary-${stamp}.csv`);
  }

  if (report === "revenue") {
    const rows = await queries.getRevenueOverTime(granularity, from, to);
    const lines = [
      "Period,Total Revenue (EGP),Net Merchandise (EGP),Order Count",
      ...rows.map((r) =>
        [
          escapeCsvCell(r.period),
          escapeCsvCell(piastresToEgp(r.totalRevenuePiastres)),
          escapeCsvCell(piastresToEgp(r.netMerchandisePiastres)),
          escapeCsvCell(r.orderCount),
        ].join(",")
      ),
    ];
    return csvResponse(lines.join("\n"), `analytics-revenue-${stamp}.csv`);
  }

  if (report === "products") {
    const rows = await queries.getProductVariantReport(from, to);
    const lines = [
      "Product,Variant,Color,SKU,Price (EGP),Qty Sold,Line Revenue (EGP),Stock Available,Stock Reserved",
      ...rows.map((r) =>
        [
          escapeCsvCell(r.productName),
          escapeCsvCell(r.variantName),
          escapeCsvCell(r.colorName ?? ""),
          escapeCsvCell(r.sku),
          escapeCsvCell(piastresToEgp(r.pricePiastres)),
          escapeCsvCell(r.quantitySold),
          escapeCsvCell(piastresToEgp(r.lineRevenuePiastres)),
          escapeCsvCell(r.stockAvailable),
          escapeCsvCell(r.stockReserved),
        ].join(",")
      ),
    ];
    return csvResponse(lines.join("\n"), `analytics-products-${stamp}.csv`);
  }

  return apiBadRequest("تقرير غير صالح. استخدم: summary | revenue | products");
}
