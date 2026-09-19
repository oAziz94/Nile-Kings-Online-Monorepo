import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { slugify } from "@/lib/admin/slug";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiConflict } from "@/lib/api/response";
import { logAdminAction, requestIp, sanitizeForAudit } from "@/lib/audit/admin-audit";
import { revalidateCategories } from "@/lib/cache/catalog-tags";

export async function GET() {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  const list = categories.map(({ _count, ...c }) => ({ ...c, productCount: _count.products }));
  return apiSuccess(list);
}

export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  let body: { name: string; slug?: string; sortOrder?: number; imageUrl?: string | null };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  if (!body.name?.trim()) return apiBadRequest("name مطلوب");
  const slug = (body.slug?.trim() || slugify(body.name)).toLowerCase().replace(/[^a-z0-9-]/g, "-") || "cat";
  const existing = await prisma.category.findUnique({ where: { slug } });
  if (existing) return apiConflict("الرابط (slug) مستخدم مسبقاً");

  const category = await prisma.category.create({
    data: {
      name: body.name.trim(),
      slug,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : 0,
      imageUrl: body.imageUrl?.trim() || null,
    },
  });

  await logAdminAction(prisma, {
    actor,
    action: "create",
    entityType: "category",
    entityId: category.id,
    entityLabel: category.name,
    after: sanitizeForAudit(category),
    ip: requestIp(req),
  });
  revalidateCategories();

  return apiSuccess(category);
}
