import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { variantSlug, buildVariantSku, STANDARD_SIZE_RUN } from "@/lib/admin/slug";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound, apiConflict, apiInternal } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";

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
    orderBy: [{ colorHex: "asc" }, { name: "asc" }],
  });
  return apiSuccess(variants);
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  let actor;
  try {
    actor = await requireAdmin();
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
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  if (body.generateSizes === true) {
    const existing = await prisma.variant.findMany({ where: { productId }, select: { name: true } });
    const existingNames = new Set(existing.map((v) => v.name));
    const toCreate = STANDARD_SIZE_RUN.filter((s) => !existingNames.has(s));
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
    await logAdminAction(prisma, {
      actor,
      action: "create",
      entityType: "product",
      entityId: productId,
      entityLabel: product.name,
      after: { sizesGenerated: toCreate },
      ip: requestIp(req),
    });
    return apiSuccess(created);
  }

  if (!body.name?.trim()) return apiBadRequest("المقاس (name) مطلوب");
  const sizePart = body.name.trim();
  const sku = buildVariantSku(product.slug, sizePart, body.colorName, body.colorHex);
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
        stockAvailable: 0,
        stockReserved: 0,
      },
    });
    await logAdminAction(prisma, {
      actor,
      action: "create",
      entityType: "variant",
      entityId: variant.id,
      entityLabel: variant.sku,
      after: { sku: variant.sku, size: variant.name, colorName: variant.colorName, pricePiastres: variant.pricePiastres },
      ip: requestIp(req),
    });
    return apiSuccess(variant);
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل إنشاء المتغير";
    return apiInternal(message);
  }
}
