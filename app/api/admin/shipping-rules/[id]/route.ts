import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { findOverlappingRules } from "@/lib/admin/shipping-overlap";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound, apiUnprocessable } from "@/lib/api/response";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const rule = await prisma.shippingRule.findUnique({ where: { id } });
  if (!rule) return apiNotFound("قاعدة الشحن غير موجودة");
  return apiSuccess(rule);
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const existing = await prisma.shippingRule.findUnique({ where: { id } });
  if (!existing) return apiNotFound("قاعدة الشحن غير موجودة");

  let body: {
    provider?: string;
    governorate?: string;
    city?: string | null;
    area?: string | null;
    weightMin?: number;
    weightMax?: number;
    feePiastres?: number;
    priority?: number;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const provider = (body.provider ?? existing.provider).trim();
  const governorate = (body.governorate ?? existing.governorate).trim();
  const weightMin = typeof body.weightMin === "number" ? body.weightMin : existing.weightMin;
  const weightMax = typeof body.weightMax === "number" ? body.weightMax : existing.weightMax;
  if (weightMin > weightMax) return apiBadRequest("weightMin يجب أن يكون أقل من أو يساوي weightMax");

  const overlapping = await findOverlappingRules({
    id,
    provider,
    governorate,
    city: body.city !== undefined ? body.city : existing.city,
    area: body.area !== undefined ? body.area : existing.area,
    weightMin,
    weightMax,
  });
  if (overlapping.length > 0) {
    return apiUnprocessable("تداخل مع قاعدة شحن موجودة", {
      overlappingRuleIds: overlapping.map((o) => o.id),
    });
  }

  const rule = await prisma.shippingRule.update({
    where: { id },
    data: {
      ...(body.provider !== undefined && { provider }),
      ...(body.governorate !== undefined && { governorate }),
      ...(body.city !== undefined && { city: body.city?.trim() || null }),
      ...(body.area !== undefined && { area: body.area?.trim() || null }),
      ...(body.weightMin !== undefined && { weightMin }),
      ...(body.weightMax !== undefined && { weightMax }),
      ...(body.feePiastres !== undefined && { feePiastres: Math.max(0, body.feePiastres) }),
      ...(body.priority !== undefined && { priority: body.priority }),
      ...(body.active !== undefined && { active: body.active }),
    },
  });
  return apiSuccess(rule);
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const rule = await prisma.shippingRule.findUnique({ where: { id } });
  if (!rule) return apiNotFound("قاعدة الشحن غير موجودة");
  await prisma.shippingRule.delete({ where: { id } });
  return apiSuccess({ deleted: true });
}
