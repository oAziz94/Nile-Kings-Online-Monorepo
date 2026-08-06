import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import * as queries from "@/lib/analytics/queries";
import type { DateGranularity } from "@/lib/analytics/types";

async function requireAgent() {
  const user = await requirePartner();
  const partner = await prisma.partner.findUnique({
    where: { id: user.partnerId },
    select: { partnerType: true },
  });
  if (partner?.partnerType !== "AGENT") {
    const err = new Error("FORBIDDEN");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return user;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAgent();
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
    if (section === "all") {
      const [kpis, revenue, products] = await Promise.all([
        queries.getKpis(from, to, scope),
        queries.getRevenueOverTime(granularity, from, to, scope),
        queries.getProductVariantReport(from, to, scope),
      ]);
      return apiSuccess({ kpis, revenue, products });
    }
    return apiBadRequest("قسم غير صالح");
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
