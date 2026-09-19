import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { logAdminAction, requestIp, sanitizeForAudit } from "@/lib/audit/admin-audit";
import { revalidateCatalog } from "@/lib/cache/catalog-tags";

/**
 * POST /api/admin/media/hero — backlog 9.8a (e)/(f). Body `{ assetId, productId }`: sets
 * `Product.heroAssetId` + `imageUrl` (the storefront card/cart representative). Audit-logged
 * (`media_hero`).
 */
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

  const body = await req.json().catch(() => null);
  const assetId: unknown = body?.assetId;
  const productId: unknown = body?.productId;
  if (typeof assetId !== "string" || !assetId) return apiBadRequest("يجب اختيار صورة");
  if (typeof productId !== "string" || !productId) return apiBadRequest("يجب اختيار منتج");

  const [asset, product] = await Promise.all([
    prisma.mediaAsset.findUnique({ where: { id: assetId } }),
    prisma.product.findUnique({ where: { id: productId } }),
  ]);
  if (!asset) return apiNotFound("الصورة غير موجودة");
  if (!product) return apiNotFound("المنتج غير موجود");

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { heroAssetId: asset.id, imageUrl: asset.url },
  });

  await logAdminAction(prisma, {
    actor,
    action: "media_hero",
    entityType: "media",
    entityId: productId,
    entityLabel: product.name,
    before: sanitizeForAudit({ heroAssetId: product.heroAssetId, imageUrl: product.imageUrl }),
    after: sanitizeForAudit({ heroAssetId: updated.heroAssetId, imageUrl: updated.imageUrl }),
    ip: requestIp(req),
  });
  revalidateCatalog({ productSlugs: [product.slug] });

  return apiSuccess({ productId, assetId: asset.id, imageUrl: asset.url });
}
