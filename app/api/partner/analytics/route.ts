import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import * as queries from "@/lib/analytics/queries";
import type { DateGranularity } from "@/lib/analytics/types";

export async function GET(req: NextRequest) {
  try {
    const user = await requirePartner();
    const { searchParams } = new URL(req.url);
    const section = searchParams.get("section") ?? "all";
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const granularity = (searchParams.get("granularity") ?? "day") as DateGranularity;
    const scope = { partnerId: user.partnerId };

    if (section === "kpis") return apiSuccess(await queries.getKpis(from, to, scope));
    if (section === "revenue") {
      return apiSuccess(await queries.getRevenueOverTime(granularity, from, to, scope));
    }
    if (section === "products") return apiSuccess(await queries.getProductVariantReport(from, to, scope));
    if (section === "stock") return apiSuccess(await queries.getStockReport(user.partnerId));
    if (section === "funnel") return apiSuccess(await queries.getOrderFunnel(from, to, scope));
    if (section === "all") {
      const [kpis, revenue, products, stock, funnel] = await Promise.all([
        queries.getKpis(from, to, scope),
        queries.getRevenueOverTime(granularity, from, to, scope),
        queries.getProductVariantReport(from, to, scope),
        queries.getStockReport(user.partnerId),
        queries.getOrderFunnel(from, to, scope),
      ]);
      return apiSuccess({ kpis, revenue, products, stock, funnel });
    }
    return apiBadRequest("قسم غير صالح");
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
