import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound, apiConflict } from "@/lib/api/response";

type Params = Promise<{ id: string }>;

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
  const existing = await prisma.variant.findUnique({ where: { id }, include: { product: true } });
  if (!existing) return apiNotFound("المتغير غير موجود");

  let body: {
    name?: string;
    colorHex?: string | null;
    colorName?: string | null;
    pricePiastres?: number;
    stockAvailable?: number;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const name = body.name !== undefined ? body.name.trim() : undefined;
  let sku = existing.sku;
  if (name !== undefined && name !== existing.name) {
    sku = `${existing.product.slug}-${name}`.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const conflict = await prisma.variant.findFirst({ where: { sku, id: { not: id } } });
    if (conflict) return apiConflict("SKU مستخدم مسبقاً");
  }

  const variant = await prisma.variant.update({
    where: { id },
    data: {
      ...(name !== undefined && { name, sku }),
      ...(body.colorHex !== undefined && { colorHex: body.colorHex?.trim() || null }),
      ...(body.colorName !== undefined && { colorName: body.colorName?.trim() || null }),
      ...(typeof body.pricePiastres === "number" && body.pricePiastres >= 0 && { pricePiastres: body.pricePiastres }),
      ...(typeof body.stockAvailable === "number" && body.stockAvailable >= 0 && { stockAvailable: body.stockAvailable }),
    },
  });
  return apiSuccess(variant);
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
  const v = await prisma.variant.findUnique({ where: { id } });
  if (!v) return apiNotFound("المتغير غير موجود");
  if (v.stockReserved > 0) return apiBadRequest("لا يمكن حذف متغير له كمية محجوزة");
  await prisma.variant.delete({ where: { id } });
  return apiSuccess({ deleted: true });
}
