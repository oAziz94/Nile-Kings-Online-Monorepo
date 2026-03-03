import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound, apiConflict } from "@/lib/api/response";

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
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) return apiNotFound("الكوبون غير موجود");
  return apiSuccess(coupon);
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
  const existing = await prisma.coupon.findUnique({ where: { id } });
  if (!existing) return apiNotFound("الكوبون غير موجود");

  let body: {
    code?: string;
    discountType?: "PERCENT" | "FIXED";
    discountValue?: number;
    minOrderPiastres?: number | null;
    maxUses?: number | null;
    validFrom?: string;
    validUntil?: string | null;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  if (body.code !== undefined) {
    const code = body.code.trim().toUpperCase();
    if (!code) return apiBadRequest("code لا يمكن أن يكون فارغاً");
    const conflict = await prisma.coupon.findFirst({ where: { code, id: { not: id } } });
    if (conflict) return apiConflict("كود الكوبون مستخدم مسبقاً");
  }
  if (body.discountType !== undefined && !["PERCENT", "FIXED"].includes(body.discountType))
    return apiBadRequest("discountType يجب أن يكون PERCENT أو FIXED");
  if (body.discountValue !== undefined) {
    const type = body.discountType ?? existing.discountType;
    if (type === "PERCENT" && (body.discountValue < 1 || body.discountValue > 100))
      return apiBadRequest("discountValue للنسبة المئوية بين 1 و 100");
    if (type === "FIXED" && body.discountValue < 0) return apiBadRequest("discountValue للقيمة الثابتة غير سالب");
  }
  if (body.maxUses !== undefined && body.maxUses !== null && (body.maxUses < 0 || body.maxUses < existing.usedCount))
    return apiBadRequest("maxUses لا يمكن أن يكون أقل من عدد مرات الاستخدام الحالية");

  const coupon = await prisma.coupon.update({
    where: { id },
    data: {
      ...(body.code !== undefined && { code: body.code.trim().toUpperCase() }),
      ...(body.discountType !== undefined && { discountType: body.discountType }),
      ...(body.discountValue !== undefined && { discountValue: body.discountValue }),
      ...(body.minOrderPiastres !== undefined && { minOrderPiastres: body.minOrderPiastres == null || (typeof body.minOrderPiastres === "number" && body.minOrderPiastres >= 0) ? body.minOrderPiastres : undefined }),
      ...(body.maxUses !== undefined && { maxUses: body.maxUses }),
      ...(body.validFrom !== undefined && { validFrom: new Date(body.validFrom) }),
      ...(body.validUntil !== undefined && { validUntil: body.validUntil ? new Date(body.validUntil) : null }),
      ...(body.active !== undefined && { active: body.active }),
    },
  });
  return apiSuccess(coupon);
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
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) return apiNotFound("الكوبون غير موجود");
  await prisma.coupon.delete({ where: { id } });
  return apiSuccess({ deleted: true });
}
