import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";
import { splitColorKey } from "@/lib/admin/variant-images";

type Params = Promise<{ id: string; colorKey: string }>;

/**
 * PATCH /api/admin/products/[id]/colors/[colorKey]/representative — backlog 9.8b review fix 1
 * (PM ruling): a colour's representative image (`Variant.imageUrl`/`imageAssetId`, what the
 * storefront card and the PDP colour swatch read) is an explicit admin choice, never derived
 * from the gallery's first photo. Body is one of:
 *   `{ assetId: string }` — from the media library ("من المكتبة").
 *   `{ assetId: null }` — clears the representative (the card falls back to the product hero).
 *   `{ variantImageId: string }` — from one of the colour's own gallery photos.
 * Sets every variant sharing the colour in one transaction. Audit-logged (`color_representative`).
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
  const { id: productId, colorKey: rawColorKey } = await params;
  const colorKey = decodeURIComponent(rawColorKey);
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return apiNotFound("المنتج غير موجود");

  const { colorName, colorHex } = splitColorKey(colorKey);
  const variants = await prisma.variant.findMany({ where: { productId, colorName, colorHex } });
  if (variants.length === 0) return apiNotFound("اللون غير موجود في هذا المنتج");

  const body = await req.json().catch(() => null);
  let resolvedUrl: string | null;
  let resolvedAssetId: string | null;

  if (body && typeof body.variantImageId === "string") {
    const img = await prisma.variantImage.findUnique({ where: { id: body.variantImageId } });
    if (!img || img.productId !== productId || img.colorKey !== colorKey) {
      return apiBadRequest("الصورة لا تنتمي لمعرض هذا اللون");
    }
    resolvedUrl = img.url;
    resolvedAssetId = img.assetId;
  } else if (body && "assetId" in body && body.assetId === null) {
    resolvedUrl = null;
    resolvedAssetId = null;
  } else if (body && typeof body.assetId === "string") {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: body.assetId } });
    if (!asset) return apiNotFound("الصورة غير موجودة");
    resolvedUrl = asset.url;
    resolvedAssetId = asset.id;
  } else {
    return apiBadRequest("يجب إرسال assetId أو variantImageId");
  }

  const previousAssetId = variants[0].imageAssetId;
  await prisma.variant.updateMany({
    where: { productId, colorName, colorHex },
    data: { imageUrl: resolvedUrl, imageAssetId: resolvedAssetId },
  });

  // `colorName` goes on `after` only (9.5 ruling, same as `color_visibility`): a key unchanged
  // between before/after is stripped by `auditDiff`, and it never changes here.
  await logAdminAction(prisma, {
    actor,
    action: "color_representative",
    entityType: "product",
    entityId: productId,
    entityLabel: product.name,
    before: { imageAssetId: previousAssetId },
    after: { imageAssetId: resolvedAssetId, colorName },
    ip: requestIp(req),
  });

  return apiSuccess({ productId, colorKey, imageUrl: resolvedUrl, imageAssetId: resolvedAssetId });
}
