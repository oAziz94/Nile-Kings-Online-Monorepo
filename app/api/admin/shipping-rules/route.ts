import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { findOverlappingRules } from "@/lib/admin/shipping-overlap";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiUnprocessable } from "@/lib/api/response";

export async function GET() {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const rules = await prisma.shippingRule.findMany({
    orderBy: [{ provider: "asc" }, { priority: "desc" }, { governorate: "asc" }],
  });
  return apiSuccess({ rules, governorateOptions: GOVERNORATE_OPTIONS });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  let body: {
    provider: string;
    governorate: string;
    city?: string | null;
    area?: string | null;
    weightMin: number;
    weightMax: number;
    feePiastres: number;
    priority?: number;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  if (!body.provider?.trim()) return apiBadRequest("provider مطلوب");
  if (!body.governorate?.trim()) return apiBadRequest("governorate مطلوب");
  const weightMin = typeof body.weightMin === "number" ? body.weightMin : 0;
  const weightMax = typeof body.weightMax === "number" ? body.weightMax : 0;
  if (weightMin > weightMax) return apiBadRequest("weightMin يجب أن يكون أقل من أو يساوي weightMax");
  const feePiastres = typeof body.feePiastres === "number" && body.feePiastres >= 0 ? body.feePiastres : 0;

  const overlapping = await findOverlappingRules({
    provider: body.provider.trim(),
    governorate: body.governorate.trim(),
    city: body.city ?? null,
    area: body.area ?? null,
    weightMin,
    weightMax,
  });
  if (overlapping.length > 0) {
    return apiUnprocessable("تداخل مع قاعدة شحن موجودة (نفس المزود والوجهة ونطاق الوزن)", {
      overlappingRuleIds: overlapping.map((o) => o.id),
    });
  }

  const rule = await prisma.shippingRule.create({
    data: {
      provider: body.provider.trim(),
      governorate: body.governorate.trim(),
      city: body.city?.trim() || null,
      area: body.area?.trim() || null,
      weightMin,
      weightMax,
      feePiastres,
      priority: typeof body.priority === "number" ? body.priority : 0,
      active: body.active !== false,
    },
  });
  return apiSuccess(rule);
}
