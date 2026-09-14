import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";
import { syncColorRepresentative } from "@/lib/admin/variant-images";

type Params = Promise<{ imageId: string }>;

/**
 * DELETE /api/admin/variant-images/[imageId] — backlog 9.8b: "معرض هذا اللون"'s remove. Does
 * not touch Cloudinary/the `MediaAsset` row (the asset may still be used elsewhere, or kept for
 * later reuse via "من المكتبة") — only the gallery membership. Re-syncs the colour's
 * representative image afterward (position 0 may have changed).
 */
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
  const { imageId } = await params;
  const image = await prisma.variantImage.findUnique({
    where: { id: imageId },
    include: { product: { select: { id: true, name: true } } },
  });
  if (!image) return apiNotFound("الصورة غير موجودة في المعرض");

  await prisma.$transaction(async (tx) => {
    await tx.variantImage.delete({ where: { id: imageId } });
    // Re-sequence the remaining photos so sortOrder stays contiguous.
    const remaining = await tx.variantImage.findMany({
      where: { productId: image.productId, colorKey: image.colorKey },
      orderBy: { sortOrder: "asc" },
    });
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].sortOrder !== i) await tx.variantImage.update({ where: { id: remaining[i].id }, data: { sortOrder: i } });
    }
    await syncColorRepresentative(tx, image.productId, image.colorKey);
  });

  await logAdminAction(prisma, {
    actor,
    action: "gallery_remove",
    entityType: "media",
    entityId: image.productId,
    entityLabel: image.product.name,
    after: { colorKey: image.colorKey, removedUrl: image.url },
    ip: requestIp(req),
  });

  return apiSuccess({ deleted: true });
}
