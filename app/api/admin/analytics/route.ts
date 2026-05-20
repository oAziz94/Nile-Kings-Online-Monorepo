import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { apiSuccess, apiUnauthorized, apiForbidden, apiBadRequest } from "@/lib/api/response";
import * as queries from "@/lib/analytics/queries";
import { getCached, setCached } from "@/lib/cache/analytics";
import type { DateGranularity } from "@/lib/analytics/types";

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
  const section = searchParams.get("section") ?? "all";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const granularity = (searchParams.get("granularity") ?? "day") as DateGranularity;
  const useCache = searchParams.get("cache") !== "no" && !from && !to;

  const params = `from=${from ?? ""}&to=${to ?? ""}&granularity=${granularity}`;

  if (section === "kpis") {
    if (useCache) {
      const cached = await getCached<queries.Kpis>("kpis", params);
      if (cached) return apiSuccess(cached);
    }
    const data = await queries.getKpis(from, to);
    if (useCache) await setCached("kpis", params, data);
    return apiSuccess(data);
  }

  if (section === "revenue") {
    if (useCache) {
      const cached = await getCached<queries.RevenueBucket[]>("revenue", params);
      if (cached) return apiSuccess(cached);
    }
    const data = await queries.getRevenueOverTime(granularity, from, to);
    if (useCache) await setCached("revenue", params, data);
    return apiSuccess(data);
  }

  if (section === "products") {
    const data = await queries.getProductVariantReport(from, to);
    return apiSuccess(data);
  }

  if (section === "all") {
    const [kpis, revenue, products] = await Promise.all([
      queries.getKpis(from, to),
      queries.getRevenueOverTime(granularity, from, to),
      queries.getProductVariantReport(from, to),
    ]);
    return apiSuccess({ kpis, revenue, products });
  }

  return apiBadRequest("قسم غير صالح");
}
