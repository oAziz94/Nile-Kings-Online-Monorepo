import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound, apiInternal } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";
import { uploadToCloudinary } from "@/lib/media/cloudinary-upload";
import { revalidateCatalog } from "@/lib/cache/catalog-tags";

/**
 * POST /api/admin/media/[id]/replace — backlog 9.8a (e)/(f). Body: multipart/form-data
 * `file` or JSON `{ image: base64, contentType }`. Uploads the new file, then in one
 * transaction points every usage of the old asset (`Product.heroAssetId`+`imageUrl`,
 * `Variant.imageAssetId`+`imageUrl`, `VariantImage.assetId`+`url`) at the new asset — the old
 * asset row stays, now unused. Audit-logged (`media_replace`).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const oldAsset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!oldAsset) return apiNotFound("الصورة غير موجودة");

  let base64: string;
  let contentType = "image/jpeg";
  const contentTypeHeader = req.headers.get("content-type") ?? "";
  if (contentTypeHeader.includes("application/json")) {
    const body = await req.json().catch(() => null);
    if (!body || typeof body.image !== "string") return apiBadRequest("يجب إرسال image (base64)");
    base64 = body.image.replace(/^data:image\/\w+;base64,/, "");
    if (body.contentType) contentType = body.contentType;
  } else if (contentTypeHeader.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return apiBadRequest("يجب إرسال file");
    const buf = await file.arrayBuffer();
    base64 = Buffer.from(buf).toString("base64");
    if (file.type) contentType = file.type;
  } else {
    return apiBadRequest("Content-Type: application/json أو multipart/form-data");
  }

  let uploaded;
  try {
    uploaded = await uploadToCloudinary({ base64, contentType, folder: oldAsset.folder });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cloudinary error";
    return apiInternal("فشل رفع الصورة الجديدة", { detail: msg });
  }
  if (!uploaded.secure_url || !uploaded.public_id) return apiInternal("لم يُرجع Cloudinary رابطاً");

  const newAsset = await prisma.mediaAsset.create({
    data: {
      publicId: uploaded.public_id,
      url: uploaded.secure_url,
      width: uploaded.width ?? null,
      height: uploaded.height ?? null,
      bytes: uploaded.bytes ?? null,
      format: uploaded.format ?? null,
      folder: oldAsset.folder,
      uploadedByUserId: actor.userId,
    },
  });

  await prisma.$transaction([
    prisma.product.updateMany({
      where: { heroAssetId: oldAsset.id },
      data: { heroAssetId: newAsset.id, imageUrl: newAsset.url },
    }),
    prisma.variant.updateMany({
      where: { imageAssetId: oldAsset.id },
      data: { imageAssetId: newAsset.id, imageUrl: newAsset.url },
    }),
    prisma.variantImage.updateMany({
      where: { assetId: oldAsset.id },
      data: { assetId: newAsset.id, url: newAsset.url },
    }),
  ]);

  await logAdminAction(prisma, {
    actor,
    action: "media_replace",
    entityType: "media",
    entityId: newAsset.id,
    entityLabel: oldAsset.publicId,
    after: { oldAssetId: oldAsset.id, newAssetId: newAsset.id },
    ip: requestIp(req),
  });
  // The old asset could back any number of products/variants/gallery images (three `updateMany`
  // calls above, no per-row slug list cheaply available) — broad catalog invalidation.
  revalidateCatalog();

  return apiSuccess({ oldAssetId: oldAsset.id, newAssetId: newAsset.id, url: newAsset.url });
}
