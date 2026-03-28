import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiConflict } from "@/lib/api/response";

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
  const qRaw = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const q = qRaw.length > 0 ? qRaw : undefined;
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const where: Prisma.CouponWhereInput = q ? { code: { contains: q, mode: "insensitive" } } : {};

  const [coupons, total] = await Promise.all([
    prisma.coupon.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      skip: offset,
    }),
    prisma.coupon.count({ where }),
  ]);

  return apiSuccess({ coupons, total, limit, offset });
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
    code: string;
    discountType: "PERCENT" | "FIXED";
    discountValue: number;
    minOrderPiastres?: number | null;
    maxUses?: number | null;
    validFrom?: string; // ISO
    validUntil?: string | null;
    active?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const code = (body.code ?? "").trim().toUpperCase();
  if (!code) return apiBadRequest("code مطلوب");
  if (!["PERCENT", "FIXED"].includes(body.discountType ?? "")) return apiBadRequest("discountType يجب أن يكون PERCENT أو FIXED");
  const discountValue = typeof body.discountValue === "number" ? body.discountValue : 0;
  if (body.discountType === "PERCENT" && (discountValue < 1 || discountValue > 100))
    return apiBadRequest("discountValue للنسبة المئوية بين 1 و 100");
  if (body.discountType === "FIXED" && discountValue < 0) return apiBadRequest("discountValue للقيمة الثابتة غير سالب");

  const existing = await prisma.coupon.findUnique({ where: { code } });
  if (existing) return apiConflict("كود الكوبون مستخدم مسبقاً");

  const validFrom = body.validFrom ? new Date(body.validFrom) : new Date();
  const validUntil = body.validUntil ? new Date(body.validUntil) : null;
  const coupon = await prisma.coupon.create({
    data: {
      code,
      discountType: body.discountType,
      discountValue,
      minOrderPiastres: typeof body.minOrderPiastres === "number" && body.minOrderPiastres >= 0 ? body.minOrderPiastres : null,
      maxUses: typeof body.maxUses === "number" && body.maxUses >= 0 ? body.maxUses : null,
      validFrom,
      validUntil,
      active: body.active !== false,
    },
  });
  return apiSuccess(coupon);
}
