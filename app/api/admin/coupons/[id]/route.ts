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
    discountType?: "PERCENT" | "FIXED" | "BOGO_QTY";
    discountValue?: number;
    minOrderPiastres?: number | null;
    maxUses?: number | null;
    validFrom?: string;
    validUntil?: string | null;
    active?: boolean;
    bogoPayQuantity?: number | null;
    bogoFreeQuantity?: number | null;
    bogoSameVariantOnly?: boolean;
    showPromotionPopup?: boolean;
    promotionPopupMessage?: string | null;
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
  if (body.discountType !== undefined && !["PERCENT", "FIXED", "BOGO_QTY"].includes(body.discountType))
    return apiBadRequest("discountType يجب أن يكون PERCENT أو FIXED أو BOGO_QTY");

  const nextType = body.discountType ?? existing.discountType;
  if (body.discountValue !== undefined) {
    if (nextType === "PERCENT" && (body.discountValue < 1 || body.discountValue > 100))
      return apiBadRequest("discountValue للنسبة المئوية بين 1 و 100");
    if (nextType === "FIXED" && body.discountValue < 0) return apiBadRequest("discountValue للقيمة الثابتة غير سالب");
  }

  if (body.bogoPayQuantity !== undefined && body.bogoPayQuantity !== null) {
    const pay = Math.trunc(body.bogoPayQuantity);
    if (pay < 1 || pay > 999) return apiBadRequest("bogoPayQuantity يجب أن يكون بين 1 و 999");
  }
  if (body.bogoFreeQuantity !== undefined && body.bogoFreeQuantity !== null) {
    const free = Math.trunc(body.bogoFreeQuantity);
    if (free < 1 || free > 999) return apiBadRequest("bogoFreeQuantity يجب أن يكون بين 1 و 999");
  }

  if (body.maxUses !== undefined && body.maxUses !== null && (body.maxUses < 0 || body.maxUses < existing.usedCount))
    return apiBadRequest("maxUses لا يمكن أن يكون أقل من عدد مرات الاستخدام الحالية");

  const typeAfter = body.discountType ?? existing.discountType;
  const clearBogo = typeAfter === "PERCENT" || typeAfter === "FIXED";
  const clearPercentFixed = typeAfter === "BOGO_QTY";

  let promotionPopupMessage: string | null | undefined = undefined;
  if (body.showPromotionPopup !== undefined || body.promotionPopupMessage !== undefined) {
    const show =
      body.showPromotionPopup !== undefined ? body.showPromotionPopup === true : existing.showPromotionPopup;
    const msgRaw =
      body.promotionPopupMessage !== undefined
        ? typeof body.promotionPopupMessage === "string"
          ? body.promotionPopupMessage.trim().slice(0, 8000)
          : ""
        : (existing.promotionPopupMessage ?? "").trim();
    if (show && !msgRaw) return apiBadRequest("نص الرسالة مطلوب عند تفعيل النافذة المنبثقة للعرض");
    promotionPopupMessage = show ? msgRaw : null;
  }

  const coupon = await prisma.coupon.update({
    where: { id },
    data: {
      ...(body.code !== undefined && { code: body.code.trim().toUpperCase() }),
      ...(body.discountType !== undefined && { discountType: body.discountType }),
      ...(clearBogo && {
        bogoPayQuantity: null,
        bogoFreeQuantity: null,
        bogoSameVariantOnly: true,
      }),
      ...(body.discountValue !== undefined && { discountValue: body.discountValue }),
      ...(clearPercentFixed && { discountValue: 0 }),
      ...(body.bogoPayQuantity !== undefined && !clearBogo && { bogoPayQuantity: body.bogoPayQuantity }),
      ...(body.bogoFreeQuantity !== undefined && !clearBogo && { bogoFreeQuantity: body.bogoFreeQuantity }),
      ...(body.bogoSameVariantOnly !== undefined && { bogoSameVariantOnly: body.bogoSameVariantOnly }),
      ...(body.showPromotionPopup !== undefined && { showPromotionPopup: body.showPromotionPopup }),
      ...(promotionPopupMessage !== undefined && { promotionPopupMessage }),
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
