import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/admin/slug";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound, apiConflict } from "@/lib/api/response";
import { logAdminAction, requestIp, sanitizeForAudit } from "@/lib/audit/admin-audit";
import { revalidateCatalog } from "@/lib/cache/catalog-tags";

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
      variantImages: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!product) return apiNotFound("المنتج غير موجود");

  // "متوفر عند N شركاء" (backlog 9.8b) — how many distinct partners stock each variant, read
  // from `PartnerInventory` (the only source of truth for stock — 06-admin-v2.md §3.5).
  const counts = product.variants.length
    ? await prisma.partnerInventory.groupBy({
        by: ["variantId"],
        where: { variantId: { in: product.variants.map((v) => v.id) }, stockAvailable: { gt: 0 } },
        _count: { partnerId: true },
      })
    : [];
  const countByVariant = new Map(counts.map((c) => [c.variantId, c._count.partnerId]));
  const variants = product.variants.map((v) => ({ ...v, partnerCount: countByVariant.get(v.id) ?? 0 }));

  return apiSuccess({ ...product, variants });
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  let actor;
  try {
    actor = await requireAdmin();
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

  await logAdminAction(prisma, {
    actor,
    action: "update",
    entityType: "product",
    entityId: id,
    entityLabel: product.name,
    before: sanitizeForAudit(existing),
    after: sanitizeForAudit(product, ["category", "variants"]),
    ip: requestIp(req),
  });

  // Revalidate both the old and (if changed) the new slug's PDP cache entry, plus the broad
  // catalog tag every listing/related/recommendations/filters/home cache carries.
  revalidateCatalog({ productSlugs: [...new Set([existing.slug, product.slug])] });

  return apiSuccess(product);
}

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id }, include: { variants: true } });
  if (!product) return apiNotFound("المنتج غير موجود");
  // Stock (including reservations) lives only in PartnerInventory now — one existence check
  // across every partner's rows for this product's variants, never a per-variant read.
  const hasReservedStock = product.variants.length
    ? await prisma.partnerInventory.findFirst({
        where: { variantId: { in: product.variants.map((v) => v.id) }, stockReserved: { gt: 0 } },
        select: { id: true },
      })
    : null;
  if (hasReservedStock) return apiBadRequest("لا يمكن حذف منتج له كميات محجوزة");
  await prisma.product.delete({ where: { id } });
  await logAdminAction(prisma, {
    actor,
    action: "delete",
    entityType: "product",
    entityId: id,
    entityLabel: product.name,
    before: sanitizeForAudit(product, ["variants"]),
    ip: requestIp(req),
  });
  revalidateCatalog({ productSlugs: [product.slug] });
  return apiSuccess({ deleted: true });
}
