import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { variantSlug } from "@/lib/admin/slug";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound, apiConflict } from "@/lib/api/response";

/** Same as in products/[id]/variants/route: ASCII-safe color part for SKU. */
function toSkuSafeColor(color: string): string {
  const cleaned = color.replace(/\s+/g, "_").toUpperCase().replace(/[^A-Z0-9_]/g, "");
  if (cleaned.length >= 2) return cleaned;
  let h = 0;
  for (let i = 0; i < color.length; i++) h = ((h << 5) - h + color.charCodeAt(i)) | 0;
  return "C" + Math.abs(h).toString(36).toUpperCase().slice(0, 8);
}

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
    basePricePiastres?: number | null;
    pricePiastres?: number;
    stockAvailable?: number;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const name = body.name !== undefined ? body.name.trim() : undefined;
  const colorName = body.colorName !== undefined ? (body.colorName?.trim() || null) : undefined;
  let newSku: string | undefined;
  let newSlug: string | undefined;
  const sizePart = (name ?? existing.name).trim();
  if (name !== undefined || colorName !== undefined) {
    const colorRaw = colorName ?? existing.colorName ?? "NOC";
    const colorPart = toSkuSafeColor(colorRaw);
    newSku = `${existing.product.slug}-${sizePart}-${colorPart}`.toUpperCase().replace(/[^A-Z0-9_]/g, "_") || `${existing.product.slug}-V`;
    const conflict = await prisma.variant.findFirst({ where: { sku: newSku, id: { not: id } } });
    if (conflict) return apiConflict("متغير بنفس المقاس واللون موجود مسبقاً");
  }
  if (name !== undefined || colorName !== undefined || body.colorHex !== undefined) {
    newSlug = variantSlug(existing.product.slug, sizePart, body.colorHex ?? existing.colorHex ?? null);
    const slugConflict = await prisma.variant.findFirst({ where: { slug: newSlug, id: { not: id } } });
    if (slugConflict) return apiConflict("متغير بنفس الرابط (slug) موجود مسبقاً");
  }

  const variant = await prisma.variant.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(body.colorHex !== undefined && { colorHex: body.colorHex?.trim() || null }),
      ...(colorName !== undefined && { colorName }),
      ...(newSku !== undefined && { sku: newSku }),
      ...(newSlug !== undefined && { slug: newSlug }),
      ...(body.basePricePiastres !== undefined && { basePricePiastres: body.basePricePiastres == null || (typeof body.basePricePiastres === "number" && body.basePricePiastres >= 0) ? body.basePricePiastres : undefined }),
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
