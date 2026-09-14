import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound, apiConflict, apiInternal } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";
import { getAssetUsage, summarizeUsage } from "@/lib/media/usage";
import { destroyCloudinaryAsset } from "@/lib/media/cloudinary-admin";

/** PATCH /api/admin/media/[id] — { alt } (backlog 9.8a (f)); audit-logged. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const body = await req.json().catch(() => null);
  if (!body || typeof body.alt !== "string") return apiBadRequest("يجب إرسال alt");

  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) return apiNotFound("الصورة غير موجودة");

  const nextAlt = body.alt.trim() || null;
  const updated = await prisma.mediaAsset.update({ where: { id }, data: { alt: nextAlt } });

  await logAdminAction(prisma, {
    actor,
    action: "update",
    entityType: "media",
    entityId: id,
    entityLabel: asset.publicId,
    before: { alt: asset.alt },
    after: { alt: updated.alt },
    ip: requestIp(req),
  });

  return apiSuccess({ id: updated.id, alt: updated.alt });
}

/** DELETE /api/admin/media/[id] — refused (409) while the asset is in use; otherwise
 * Cloudinary `destroy` then the row deleted, audit-logged (backlog 9.8a (e)/(f)). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) return apiNotFound("الصورة غير موجودة");

  if (!asset.deletedAt) {
    const usageMap = await getAssetUsage([{ id: asset.id, url: asset.url, publicId: asset.publicId }]);
    const entries = usageMap.get(asset.id) ?? [];
    if (entries.length > 0) {
      return apiConflict(`لا يمكن حذف صورة مستخدمة: ${summarizeUsage(entries)}`);
    }
    try {
      await destroyCloudinaryAsset(asset.publicId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Cloudinary error";
      return apiInternal("فشل حذف الصورة من Cloudinary", { detail: msg });
    }
  }

  await prisma.mediaAsset.delete({ where: { id } });

  await logAdminAction(prisma, {
    actor,
    action: "delete",
    entityType: "media",
    entityId: id,
    entityLabel: asset.publicId,
    ip: requestIp(req),
  });

  return apiSuccess({ id });
}
