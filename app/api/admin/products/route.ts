import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/admin/slug";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiConflict } from "@/lib/api/response";

export async function GET() {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const products = await prisma.product.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: { select: { id: true, sku: true, name: true, pricePiastres: true, stockAvailable: true, stockReserved: true, colorHex: true, colorName: true } },
    },
  });
  return apiSuccess(products);
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
    name: string;
    slug?: string;
    categoryId: string;
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
  if (!body.name?.trim()) return apiBadRequest("name مطلوب");
  if (!body.categoryId) return apiBadRequest("categoryId مطلوب");
  const slug = (body.slug?.trim() || slugify(body.name)).toLowerCase().replace(/[^a-z0-9-]/g, "-") || "product";
  const existing = await prisma.product.findUnique({ where: { slug } });
  if (existing) return apiConflict("الرابط (slug) مستخدم مسبقاً");

  const category = await prisma.category.findUnique({ where: { id: body.categoryId } });
  if (!category) return apiBadRequest("الفئة غير موجودة");

  const product = await prisma.product.create({
    data: {
      categoryId: body.categoryId,
      name: body.name.trim(),
      slug,
      description: body.description?.trim() || null,
      imageUrl: body.imageUrl?.trim() || null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
      active: body.active !== false,
      weightGrams: typeof body.weightGrams === "number" && body.weightGrams >= 0 ? body.weightGrams : null,
      basePricePiastres: typeof body.basePricePiastres === "number" && body.basePricePiastres >= 0 ? body.basePricePiastres : null,
      discountPricePiastres: typeof body.discountPricePiastres === "number" && body.discountPricePiastres >= 0 ? body.discountPricePiastres : null,
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: true,
    },
  });
  return apiSuccess(product);
}
