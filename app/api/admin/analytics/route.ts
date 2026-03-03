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

  if (section === "best_sellers") {
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
    const data = await queries.getBestSellers(from, to, limit);
    return apiSuccess(data);
  }

  if (section === "variant_performance") {
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
    const data = await queries.getVariantPerformance(from, to, limit);
    return apiSuccess(data);
  }

  if (section === "low_stock") {
    const threshold = Math.max(0, parseInt(searchParams.get("threshold") ?? "5", 10) || 5);
    const data = await queries.getLowStockAlerts(threshold);
    return apiSuccess(data);
  }

  if (section === "coupons") {
    const data = await queries.getCouponPerformance(from, to);
    return apiSuccess(data);
  }

  if (section === "senior_promo") {
    const data = await queries.getSeniorPromoReport(from, to);
    return apiSuccess(data);
  }

  if (section === "providers") {
    const data = await queries.getProviderPerformance(from, to);
    return apiSuccess(data);
  }

  if (section === "payment_methods") {
    const data = await queries.getPaymentMethodBreakdown(from, to);
    return apiSuccess(data);
  }

  if (section === "all") {
    const [
      kpis,
      revenue,
      bestSellers,
      variantPerformance,
      lowStock,
      coupons,
      seniorPromo,
      providers,
      paymentMethods,
    ] = await Promise.all([
      queries.getKpis(from, to),
      queries.getRevenueOverTime(granularity, from, to),
      queries.getBestSellers(from, to, 20),
      queries.getVariantPerformance(from, to, 30),
      queries.getLowStockAlerts(5),
      queries.getCouponPerformance(from, to),
      queries.getSeniorPromoReport(from, to),
      queries.getProviderPerformance(from, to),
      queries.getPaymentMethodBreakdown(from, to),
    ]);
    return apiSuccess({
      kpis,
      revenue,
      bestSellers,
      variantPerformance,
      lowStock,
      coupons,
      seniorPromo,
      providers,
      paymentMethods,
    });
  }

  return apiBadRequest("قسم غير صالح");
}
