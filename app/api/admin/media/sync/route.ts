import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized, apiForbidden, apiInternal } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";
import { setSiteSetting } from "@/lib/settings";
import { listAllCloudinaryResources, isCloudinaryConfigured } from "@/lib/media/cloudinary-admin";
import { computeSyncDiff, computeAdoptionMatches } from "@/lib/media/sync";
import type { NextRequest } from "next/server";

/**
 * POST /api/admin/media/sync — backlog 9.8a (d), reconcile with Cloudinary.
 *
 * Lists `nile-kings/products` and `nile-kings/routed-proofs` through the Admin API (paginated
 * by `next_cursor`, 500/page), imports every resource not yet registered as an unused
 * `MediaAsset`, marks registered rows whose resource is gone with `deletedAt`, and adopts
 * legacy URLs (`Product.imageUrl`/`Variant.imageUrl`/`VariantImage.url` rows whose url matches
 * a registered asset but whose id column is still null). Audit-logged (`media`, `sync`);
 * "آخر مزامنة" stored in `SiteSetting.mediaLastSyncAt`.
 */
const FOLDERS = ["nile-kings/products", "nile-kings/routed-proofs"];

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

  if (!isCloudinaryConfigured()) {
    return apiInternal("Cloudinary غير مضبوط");
  }

  const startedAt = Date.now();

  let resources;
  try {
    const perFolder = await Promise.all(FOLDERS.map((f) => listAllCloudinaryResources(f)));
    resources = perFolder.flat();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cloudinary error";
    return apiInternal("فشلت المزامنة مع Cloudinary", { detail: msg });
  }

  const registered = await prisma.mediaAsset.findMany({
    where: { deletedAt: null, OR: FOLDERS.map((f) => ({ folder: { contains: f } })) },
    select: { id: true, publicId: true, url: true },
  });

  const diff = computeSyncDiff(resources, registered);

  let imported = 0;
  if (diff.toImport.length > 0) {
    await prisma.$transaction(
      diff.toImport.map((r) =>
        prisma.mediaAsset.upsert({
          where: { publicId: r.public_id },
          create: {
            publicId: r.public_id,
            url: r.secure_url,
            width: r.width ?? null,
            height: r.height ?? null,
            bytes: r.bytes ?? null,
            format: r.format ?? null,
            folder: r.folder ?? (r.public_id.startsWith("nile-kings/routed-proofs") ? "nile-kings/routed-proofs" : "nile-kings/products"),
          },
          update: { deletedAt: null },
        })
      )
    );
    imported = diff.toImport.length;
  }

  let missing = 0;
  if (diff.missingPublicIds.length > 0) {
    const res = await prisma.mediaAsset.updateMany({
      where: { publicId: { in: diff.missingPublicIds } },
      data: { deletedAt: new Date() },
    });
    missing = res.count;
  }

  // Adoption: every registered asset's url (post-import), matched against legacy Product/
  // Variant/VariantImage rows whose id column is still unset.
  const allAssets = await prisma.mediaAsset.findMany({
    where: { deletedAt: null },
    select: { id: true, url: true },
  });
  const assetIdByUrl = new Map(allAssets.map((a) => [a.url, a.id]));

  const [legacyProducts, legacyVariants, legacyVariantImages] = await Promise.all([
    prisma.product.findMany({ where: { heroAssetId: null, imageUrl: { not: null } }, select: { id: true, imageUrl: true } }),
    prisma.variant.findMany({ where: { imageAssetId: null, imageUrl: { not: null } }, select: { id: true, imageUrl: true } }),
    prisma.variantImage.findMany({ where: { assetId: null }, select: { id: true, url: true } }),
  ]);

  const productMatches = computeAdoptionMatches(
    legacyProducts.map((p) => ({ id: p.id, url: p.imageUrl! })),
    assetIdByUrl
  );
  const variantMatches = computeAdoptionMatches(
    legacyVariants.map((v) => ({ id: v.id, url: v.imageUrl! })),
    assetIdByUrl
  );
  const variantImageMatches = computeAdoptionMatches(
    legacyVariantImages.map((vi) => ({ id: vi.id, url: vi.url })),
    assetIdByUrl
  );

  await prisma.$transaction([
    ...productMatches.map((m) => prisma.product.update({ where: { id: m.rowId }, data: { heroAssetId: m.assetId } })),
    ...variantMatches.map((m) => prisma.variant.update({ where: { id: m.rowId }, data: { imageAssetId: m.assetId } })),
    ...variantImageMatches.map((m) => prisma.variantImage.update({ where: { id: m.rowId }, data: { assetId: m.assetId } })),
  ]);
  const adopted = productMatches.length + variantMatches.length + variantImageMatches.length;

  const now = new Date();
  await setSiteSetting("mediaLastSyncAt", now.toISOString());

  await logAdminAction(prisma, {
    actor,
    action: "sync",
    entityType: "media",
    entityId: "cloudinary",
    entityLabel: "Cloudinary",
    after: { imported, missing, adopted },
    ip: requestIp(req),
  });

  const durationMs = Date.now() - startedAt;
  return apiSuccess({
    imported,
    missing,
    adopted,
    total: resources.length,
    durationMs,
    lastSyncAt: now.toISOString(),
  });
}
