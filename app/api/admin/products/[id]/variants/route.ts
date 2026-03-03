import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound, apiConflict } from "@/lib/api/response";

const SIZES = ["S", "M", "L", "XL", "XXL"] as const;

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

  if (body.generateSizes === true) {
    const existing = await prisma.variant.findMany({ where: { productId }, select: { name: true } });
    const existingNames = new Set(existing.map((v) => v.name));
    const toCreate = SIZES.filter((s) => !existingNames.has(s));
    if (toCreate.length === 0) return apiConflict("جميع المقاسات موجودة مسبقاً");
    const basePrice = product.discountPricePiastres ?? product.basePricePiastres ?? 0;
    const created = await prisma.$transaction(
      toCreate.map((name) => {
        const sku = `${product.slug}-${name}`.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
        return prisma.variant.create({
          data: {
            productId,
            sku,
            name,
            pricePiastres: basePrice || 0,
            stockAvailable: 0,
            stockReserved: 0,
          },
        });
      })
    );
    return apiSuccess(created);
  }

  if (!body.name?.trim()) return apiBadRequest("name مطلوب (أو استخدم generateSizes: true)");
  const price = typeof body.pricePiastres === "number" && body.pricePiastres >= 0 ? body.pricePiastres : (product.discountPricePiastres ?? product.basePricePiastres ?? 0);
  const sku = `${product.slug}-${body.name.trim()}`.toUpperCase().replace(/[^A-Z0-9_]/g, "_") || `${product.slug}-V`;
  const existingSku = await prisma.variant.findUnique({ where: { sku } });
  if (existingSku) return apiConflict("SKU مستخدم مسبقاً");

  const variant = await prisma.variant.create({
    data: {
      productId,
      sku,
      name: body.name.trim(),
      colorHex: body.colorHex?.trim() || null,
      colorName: body.colorName?.trim() || null,
      pricePiastres: price,
      stockAvailable: typeof body.stockAvailable === "number" && body.stockAvailable >= 0 ? body.stockAvailable : 0,
      stockReserved: 0,
    },
  });
  return apiSuccess(variant);
}
