import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized, apiForbidden, apiBadRequest, apiInternal } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";
import { getSiteSetting, setSiteSetting } from "@/lib/settings";
import { listCloudinaryResourcesPage, isCloudinaryConfigured } from "@/lib/media/cloudinary-admin";
import { computeAdoptionMatches, missingFromSeen, type CloudinaryResource } from "@/lib/media/sync";
import type { NextRequest } from "next/server";

/**
 * POST /api/admin/media/sync — backlog 9.8a (d), reconcile with Cloudinary.
 *
 * Lists `nile-kings/products` and `nile-kings/routed-proofs` through the Admin API (paginated
 * by `next_cursor`, 500/page). Import is incremental (a resource not yet registered is upserted
 * the moment its page is fetched — that decision only needs that one page); missing-detection
 * needs the *whole* listing (a registered row is only "missing" once every page has confirmed
 * its resource never showed up), so it happens once the listing is fully exhausted, whether
 * that took one request or several.
 *
 * Verifier fix (9.8a NEEDS REWORK item 5): a single request budgets 45s of wall time for the
 * listing loop (`WALL_TIME_BUDGET_MS`) — `export const maxDuration = 60` gives Vercel's Node
 * runtime the full minute, but a folder large enough to need more than 45s of *listing* still
 * has DB writes and the missing/adoption pass to do after, so the loop yields with margin
 * rather than racing the platform's hard limit. Progress (which folder/cursor we're on, every
 * public id seen and every import already written) persists in `SiteSetting.mediaSyncProgress`
 * between calls; the caller re-POSTs with `?cursor=continue` until the response's `nextCursor`
 * is `null`, showing "N/M" from `scannedSoFar`/`estimatedTotal`. Audit-logged once, on the call
 * that finishes; "آخر مزامنة" stored in `SiteSetting.mediaLastSyncAt` on that same call.
 */
export const maxDuration = 60;

const FOLDERS = ["nile-kings/products", "nile-kings/routed-proofs"];
const WALL_TIME_BUDGET_MS = 45_000;
const PROGRESS_KEY = "mediaSyncProgress";

type SyncProgress = {
  folderIndex: number;
  cloudinaryCursor: string | null;
  seenPublicIds: string[];
  importedSoFar: number;
};

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

  const { searchParams } = new URL(req.url);
  const resuming = searchParams.get("cursor") === "continue";

  const startedAt = Date.now();
  let progress: SyncProgress;
  if (resuming) {
    const raw = await getSiteSetting(PROGRESS_KEY);
    if (!raw) return apiBadRequest("جلسة المزامنة غير موجودة، ابدأ من جديد");
    progress = JSON.parse(raw) as SyncProgress;
  } else {
    progress = { folderIndex: 0, cloudinaryCursor: null, seenPublicIds: [], importedSoFar: 0 };
  }

  const registered = await prisma.mediaAsset.findMany({
    where: { deletedAt: null, OR: FOLDERS.map((f) => ({ folder: { contains: f } })) },
    select: { id: true, publicId: true, url: true },
  });
  const registeredIds = new Set(registered.map((r) => r.publicId));
  // Resources this progress already imported in an earlier call must not be re-counted as "to
  // import" again — they're in `registered` from the DB by now anyway, this just makes the
  // in-loop `toImport` filter correct without a fresh DB read every page.
  for (const id of progress.seenPublicIds) registeredIds.add(id);

  try {
    while (progress.folderIndex < FOLDERS.length) {
      const folder = FOLDERS[progress.folderIndex];
      const page = await listCloudinaryResourcesPage(folder, progress.cloudinaryCursor ?? undefined, 500);

      const toImport = page.resources.filter((r) => !registeredIds.has(r.public_id));
      if (toImport.length > 0) {
        await importResources(toImport);
        progress.importedSoFar += toImport.length;
        for (const r of toImport) registeredIds.add(r.public_id);
      }
      for (const r of page.resources) progress.seenPublicIds.push(r.public_id);

      if (page.nextCursor) {
        progress.cloudinaryCursor = page.nextCursor;
      } else {
        progress.folderIndex += 1;
        progress.cloudinaryCursor = null;
      }

      if (Date.now() - startedAt > WALL_TIME_BUDGET_MS && progress.folderIndex < FOLDERS.length) {
        await setSiteSetting(PROGRESS_KEY, JSON.stringify(progress));
        return apiSuccess({
          done: false,
          nextCursor: "continue",
          scannedSoFar: progress.seenPublicIds.length,
          importedSoFar: progress.importedSoFar,
        });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cloudinary error";
    return apiInternal("فشلت المزامنة مع Cloudinary", { detail: msg });
  }

  // Listing fully exhausted (across however many calls it took) — now, and only now, it's safe
  // to decide what's missing.
  const missingPublicIds = missingFromSeen(registered, progress.seenPublicIds);
  let missing = 0;
  if (missingPublicIds.length > 0) {
    const res = await prisma.mediaAsset.updateMany({
      where: { publicId: { in: missingPublicIds } },
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
  const imported = progress.importedSoFar;

  const now = new Date();
  await setSiteSetting("mediaLastSyncAt", now.toISOString());
  await prisma.siteSetting.deleteMany({ where: { key: PROGRESS_KEY } });

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
    done: true,
    nextCursor: null,
    imported,
    missing,
    adopted,
    total: progress.seenPublicIds.length,
    durationMs,
    lastSyncAt: now.toISOString(),
  });
}

async function importResources(resources: CloudinaryResource[]): Promise<void> {
  await prisma.$transaction(
    resources.map((r) =>
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
}
