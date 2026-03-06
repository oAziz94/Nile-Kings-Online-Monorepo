import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { variantSlug } from "@/lib/admin/slug";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound, apiConflict, apiInternal } from "@/lib/api/response";

const SIZES = ["S", "M", "L", "XL", "XXL"] as const;

/** Turns color name/hex into an ASCII-safe part for SKU (handles Arabic etc.). */
function toSkuSafeColor(color: string): string {
  const cleaned = color.replace(/\s+/g, "_").toUpperCase().replace(/[^A-Z0-9_]/g, "");
  if (cleaned.length >= 2) return cleaned;
  let h = 0;
  for (let i = 0; i < color.length; i++) h = ((h << 5) - h + color.charCodeAt(i)) | 0;
  return "C" + Math.abs(h).toString(36).toUpperCase().slice(0, 8);
}

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
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return apiNotFound("المنتج غير موجود");
  const variants = await prisma.variant.findMany({
    where: { productId: id },
    orderBy: [{ name: "asc" }],
  });
  return apiSuccess(variants);
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id: productId } = await params;
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return apiNotFound("المنتج غير موجود");

  let body: {
    generateSizes?: boolean;
    name?: string; // size
    colorHex?: string | null;
    colorName?: string | null;
    imageUrl?: string | null;
    basePricePiastres?: number | null;
    pricePiastres?: number;
    stockAvailable?: number;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  if (body.generateSizes === true) {
    const existing = await prisma.variant.findMany({ where: { productId }, select: { name: true } });
    const existingNames = new Set(existing.map((v) => v.name));
    const toCreate = SIZES.filter((s) => !existingNames.has(s));
    if (toCreate.length === 0) return apiConflict("جميع المقاسات موجودة مسبقاً");
    const productDiscount = product.discountPricePiastres ?? product.basePricePiastres ?? 0;
    const productBase = product.basePricePiastres ?? null;
    const created = await prisma.$transaction(
      toCreate.map((name) => {
        const sku = `${product.slug}-${name}-NOC`.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        const slug = variantSlug(product.slug, name, null);
        return prisma.variant.create({
          data: {
            productId,
            sku,
            slug,
            name,
            basePricePiastres: productBase,
            pricePiastres: productDiscount || 0,
            stockAvailable: 0,
            stockReserved: 0,
          },
        });
      })
    );
    return apiSuccess(created);
  }

  if (!body.name?.trim()) return apiBadRequest("المقاس (name) مطلوب");
  const sizePart = body.name.trim();
  const colorRaw = body.colorName?.trim() || body.colorHex?.trim() || "NOC";
  const colorPartForSku = toSkuSafeColor(colorRaw);
  const skuBase = `${product.slug}-${sizePart}-${colorPartForSku}`;
  const sku = skuBase.toUpperCase().replace(/[^A-Z0-9_]/g, "_") || `${product.slug}-V`;
  const slug = variantSlug(product.slug, sizePart, body.colorHex?.trim() || null);
  const existingSku = await prisma.variant.findUnique({ where: { sku } });
  if (existingSku) return apiConflict("متغير بنفس المقاس واللون موجود مسبقاً");
  const existingSlug = await prisma.variant.findUnique({ where: { slug } });
  if (existingSlug) return apiConflict("متغير بنفس الرابط (slug) موجود مسبقاً");

  const productDiscount = product.discountPricePiastres ?? product.basePricePiastres ?? 0;
  const productBase = product.basePricePiastres ?? null;
  const variantBase = typeof body.basePricePiastres === "number" && body.basePricePiastres >= 0 ? body.basePricePiastres : productBase;
  const variantPrice = typeof body.pricePiastres === "number" && body.pricePiastres >= 0 ? body.pricePiastres : productDiscount;

  try {
    const variant = await prisma.variant.create({
      data: {
        productId,
        sku,
        slug,
        name: sizePart,
        colorHex: body.colorHex?.trim() || null,
        colorName: body.colorName?.trim() || null,
        imageUrl: body.imageUrl?.trim() || null,
        basePricePiastres: variantBase,
        pricePiastres: variantPrice,
        stockAvailable: typeof body.stockAvailable === "number" && body.stockAvailable >= 0 ? body.stockAvailable : 0,
        stockReserved: 0,
      },
    });
    return apiSuccess(variant);
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل إنشاء المتغير";
    return apiInternal(message);
  }
}
