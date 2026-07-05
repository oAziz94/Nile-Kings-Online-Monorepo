import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/admin/slug";
import { sortVariants } from "@/lib/admin/variant-sort";
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
  const active = searchParams.get("active");

  const where: Prisma.ProductWhereInput = {
    ...(active === "true" && { active: true }),
    ...(active === "false" && { active: false }),
    ...(q && {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { slug: { contains: q, mode: "insensitive" } },
      ],
    }),
  };

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ sortOrder: "desc" }, { createdAt: "desc" }],
      take: limit,
      skip: offset,
      include: {
        category: { select: { id: true, name: true, slug: true } },
        variants: { select: { id: true, sku: true, name: true, pricePiastres: true, stockAvailable: true, stockReserved: true, colorHex: true, colorName: true } },
      },
    }),
    prisma.product.count({ where }),
  ]);

  return apiSuccess({ products: products.map((p) => ({ ...p, variants: sortVariants(p.variants) })), total, limit, offset });
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
