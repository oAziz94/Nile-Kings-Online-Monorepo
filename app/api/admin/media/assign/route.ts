import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";
import { colorKeyOf } from "@/lib/admin/variant-images";

/**
 * POST /api/admin/media/assign — backlog 9.8a (e)/(f). Body `{ assetIds, productId,
 * colorKey }`: appends every asset to that colour's gallery as `VariantImage` rows
 * (`assetId` + `url`, next `sortOrder`). Audit-logged once per call (`media_assign`).
 *
 * Deliberately does not touch `Variant.imageUrl`/`imageAssetId` (the colour's "representative"
 * image, per 9.8a's usage model — a distinct concept from the gallery, matching the storefront
 * card's own priority: `lib/catalog.ts`'s `buildProductListItem` prefers a variant's `imageUrl`
 * over `Product.imageUrl` when set, so auto-writing it here would silently override "تعيين
 * كصورة رئيسية" on the storefront card — caught by `admin-v2-media.spec.ts`'s hero test during
 * 9.8b's own verification, reverted same-day).
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
  const assetIds: unknown = body?.assetIds;
  const productId: unknown = body?.productId;
  const targetColorKey: unknown = body?.colorKey;
  if (!Array.isArray(assetIds) || assetIds.length === 0 || assetIds.some((a) => typeof a !== "string")) {
    return apiBadRequest("يجب اختيار صورة واحدة على الأقل");
  }
  if (typeof productId !== "string" || !productId) return apiBadRequest("يجب اختيار منتج");
  if (typeof targetColorKey !== "string" || !targetColorKey) return apiBadRequest("يجب اختيار لون");

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true } });
  if (!product) return apiNotFound("المنتج غير موجود");

  const variants = await prisma.variant.findMany({
    where: { productId },
    select: { colorName: true, colorHex: true },
  });
  const colorMatch = variants.find((v) => colorKeyOf(v) === targetColorKey);
  if (!colorMatch) return apiBadRequest("اللون غير موجود في هذا المنتج");

  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: assetIds } } });
  if (assets.length !== assetIds.length) return apiNotFound("بعض الصور غير موجودة");

  const last = await prisma.variantImage.findFirst({
    where: { productId, colorKey: targetColorKey },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  let nextSort = (last?.sortOrder ?? -1) + 1;

  const orderedAssets = assetIds.map((id) => assets.find((a) => a.id === id)!);
  await prisma.$transaction(
    orderedAssets.map((asset) =>
      prisma.variantImage.create({
        data: {
          productId,
          colorKey: targetColorKey,
          url: asset.url,
          assetId: asset.id,
          sortOrder: nextSort++,
        },
      })
    )
  );

  await logAdminAction(prisma, {
    actor,
    action: "media_assign",
    entityType: "media",
    entityId: productId,
    entityLabel: product.name,
    after: { count: assetIds.length, colorLabel: colorMatch.colorName ?? "" },
    ip: requestIp(req),
  });

  return apiSuccess({ productId, colorKey: targetColorKey, count: assetIds.length });
}
