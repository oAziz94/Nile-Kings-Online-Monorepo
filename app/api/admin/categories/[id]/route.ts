import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/admin/slug";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound, apiConflict } from "@/lib/api/response";
import { logAdminAction, requestIp, sanitizeForAudit } from "@/lib/audit/admin-audit";
import { revalidateCategories, revalidateCatalog } from "@/lib/cache/catalog-tags";

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
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) return apiNotFound("الفئة غير موجودة");
  return apiSuccess({ ...category, productCount: category._count.products });
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
  const existing = await prisma.category.findUnique({ where: { id } });
  if (!existing) return apiNotFound("الفئة غير موجودة");

  let body: { name?: string; slug?: string; sortOrder?: number; imageUrl?: string | null };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const slug = body.slug !== undefined
    ? (body.slug.trim() || slugify(body.name ?? existing.name)).toLowerCase().replace(/[^a-z0-9-]/g, "-") || "cat"
    : undefined;
  if (slug !== undefined) {
    const conflict = await prisma.category.findFirst({ where: { slug, id: { not: id } } });
    if (conflict) return apiConflict("الرابط (slug) مستخدم مسبقاً");
  }

  const category = await prisma.category.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(slug !== undefined && { slug }),
      ...(typeof body.sortOrder === "number" && { sortOrder: body.sortOrder }),
      ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl?.trim() || null }),
    },
  });

  await logAdminAction(prisma, {
    actor,
    action: "update",
    entityType: "category",
    entityId: id,
    entityLabel: category.name,
    before: sanitizeForAudit(existing),
    after: sanitizeForAudit(category),
    ip: requestIp(req),
  });
  // Renaming/reslugging a category changes the categoryName/categorySlug embedded in every
  // product-listing/related/recommendations/home item under it, on top of the category caches.
  revalidateCategories();
  revalidateCatalog();

  return apiSuccess(category);
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
  const cat = await prisma.category.findUnique({ where: { id }, include: { _count: { select: { products: true } } } });
  if (!cat) return apiNotFound("الفئة غير موجودة");
  if (cat._count.products > 0) return apiBadRequest("لا يمكن حذف فئة تحتوي منتجات");
  await prisma.category.delete({ where: { id } });
  await logAdminAction(prisma, {
    actor,
    action: "delete",
    entityType: "category",
    entityId: id,
    entityLabel: cat.name,
    before: sanitizeForAudit(cat, ["_count"]),
    ip: requestIp(req),
  });
  revalidateCategories();
  return apiSuccess({ deleted: true });
}
