import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/admin/slug";
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
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: { orderBy: [{ colorHex: "asc" }, { name: "asc" }] },
    },
  });
  if (!product) return apiNotFound("المنتج غير موجود");
  return apiSuccess(product);
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
  const existing = await prisma.product.findUnique({ where: { id } });
  if (!existing) return apiNotFound("المنتج غير موجود");

  let body: {
    name?: string;
    slug?: string;
    categoryId?: string;
    description?: string | null;
    imageUrl?: string | null;
    tags?: string[];
    sortOrder?: number;
    active?: boolean;
    weightGrams?: number | null;
    basePricePiastres?: number | null;
    discountPricePiastres?: number | null;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const slug = body.slug !== undefined
    ? (body.slug.trim() || slugify(body.name ?? existing.name)).toLowerCase().replace(/[^a-z0-9-]/g, "-") || "product"
    : undefined;
  if (slug !== undefined) {
    const conflict = await prisma.product.findFirst({ where: { slug, id: { not: id } } });
    if (conflict) return apiConflict("الرابط (slug) مستخدم مسبقاً");
  }
  if (body.categoryId) {
    const cat = await prisma.category.findUnique({ where: { id: body.categoryId } });
    if (!cat) return apiBadRequest("الفئة غير موجودة");
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(slug !== undefined && { slug }),
      ...(body.categoryId !== undefined && { categoryId: body.categoryId }),
      ...(body.description !== undefined && { description: body.description?.trim() || null }),
      ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl?.trim() || null }),
      ...(body.tags !== undefined && { tags: Array.isArray(body.tags) ? body.tags : existing.tags }),
      ...(typeof body.sortOrder === "number" && { sortOrder: body.sortOrder }),
      ...(body.active !== undefined && { active: body.active }),
      ...(body.weightGrams !== undefined && { weightGrams: body.weightGrams == null || (typeof body.weightGrams === "number" && body.weightGrams >= 0) ? body.weightGrams : undefined }),
      ...(body.basePricePiastres !== undefined && { basePricePiastres: body.basePricePiastres == null || (typeof body.basePricePiastres === "number" && body.basePricePiastres >= 0) ? body.basePricePiastres : undefined }),
      ...(body.discountPricePiastres !== undefined && { discountPricePiastres: body.discountPricePiastres == null || (typeof body.discountPricePiastres === "number" && body.discountPricePiastres >= 0) ? body.discountPricePiastres : undefined }),
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: { orderBy: [{ colorHex: "asc" }, { name: "asc" }] },
    },
  });
  return apiSuccess(product);
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
  const product = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
  if (!product) return apiNotFound("المنتج غير موجود");
  if (product.variants.some((v) => v.stockReserved > 0)) return apiBadRequest("لا يمكن حذف منتج له كميات محجوزة");
  await prisma.product.delete({ where: { id } });
  return apiSuccess({ deleted: true });
}
