import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";

type Params = Promise<{ id: string }>;

/**
 * PATCH /api/admin/products/[id]/gallery/reorder — backlog 9.8b: "معرض هذا اللون"'s drag
 * reorder. Body `{ colorKey, orderedImageIds }` — every id must be a `VariantImage` row
 * belonging to this product+colour; `sortOrder` is rewritten to array position (position 0 gets
 * the gold-ring "representative" treatment in the admin UI — display-only, read straight off
 * this array; does not write `Variant.imageUrl`, see `media/assign/route.ts`'s doc comment).
 */
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
  const { id: productId } = await params;
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true } });
  if (!product) return apiNotFound("المنتج غير موجود");

  const body = await req.json().catch(() => null);
  const colorKey: unknown = body?.colorKey;
  const orderedImageIds: unknown = body?.orderedImageIds;
  if (typeof colorKey !== "string" || !colorKey) return apiBadRequest("اللون مطلوب");
  if (!Array.isArray(orderedImageIds) || orderedImageIds.some((x) => typeof x !== "string")) {
    return apiBadRequest("ترتيب الصور غير صالح");
  }

  const rows = await prisma.variantImage.findMany({ where: { productId, colorKey } });
  const rowIds = new Set(rows.map((r) => r.id));
  if (orderedImageIds.length !== rows.length || !orderedImageIds.every((id) => rowIds.has(id as string))) {
    return apiBadRequest("قائمة الصور لا تطابق معرض هذا اللون");
  }

  await prisma.$transaction(
    orderedImageIds.map((imageId, i) => prisma.variantImage.update({ where: { id: imageId as string }, data: { sortOrder: i } }))
  );

  await logAdminAction(prisma, {
    actor,
    action: "gallery_reorder",
    entityType: "media",
    entityId: productId,
    entityLabel: product.name,
    after: { colorKey, order: orderedImageIds },
    ip: requestIp(req),
  });

  return apiSuccess({ productId, colorKey });
}
