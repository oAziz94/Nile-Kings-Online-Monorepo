/**
 * Backlog 9.10 (from the 9.8a close-out) — the الصور library's "missing (N)"/"غير مستخدمة
 * (N)" chip counts, 60-second in-memory cache. `unusedCount` in particular is the library's
 * own bounded table scan (`countUnused` in `app/api/admin/media/route.ts`, up to 5,000 rows
 * per request) — cheap at today's ~200-asset catalog, but the one worth not repeating on
 * every keystroke of a filter that doesn't change the underlying data.
 *
 * `MediaAsset` has no `updatedAt` column (see `prisma/schema.prisma`), so the cache key below
 * is a proxy for it: total row count + how many carry `deletedAt` (a new upload, the Cloudinary
 * reconcile marking a row missing) + how many gallery/hero/representative slots point at an
 * asset (an assign or a removal, which changes `unused` without touching `MediaAsset`). The
 * 60s TTL is the backstop for whatever this proxy still misses (a same-count replace). A real,
 * precisely-invalidated cache is Phase 6's call.
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const MEDIA_COUNTS_CACHE_TTL_MS = 60_000;
const SCAN_BATCH = 200;
const MAX_SCAN = 5000;

type AssetIdRow = { id: string; url: string; publicId: string };

type CountsCacheEntry = { expiresAt: number; value: { missing: number; unused: number } };
/** Keyed by `${dataVersion}::${JSON.stringify(where)}` — one entry per distinct filter
 * combination so switching between the library's few filter chips doesn't thrash a single
 * slot. Capped well above any realistic number of distinct filter combos in one 60s window. */
const MEDIA_COUNTS_CACHE_MAX_ENTRIES = 50;
const mediaCountsCache = new Map<string, CountsCacheEntry>();

async function mediaDataVersion(): Promise<string> {
  // PM addition (9.10 review): `unused` also moves when an image is assigned to or removed
  // from a gallery, a hero or a colour representative — writes that touch `VariantImage`,
  // `Product` and `Variant`, not `MediaAsset`. Their "how many point at an asset" counts join
  // the key, so an assign/remove invalidates immediately; only a same-count swap (replace A
  // with B) still waits for the TTL.
  const [total, deleted, galleryRefs, heroRefs, representativeRefs] = await Promise.all([
    prisma.mediaAsset.count(),
    prisma.mediaAsset.count({ where: { deletedAt: { not: null } } }),
    prisma.variantImage.count({ where: { assetId: { not: null } } }),
    prisma.product.count({ where: { heroAssetId: { not: null } } }),
    prisma.variant.count({ where: { imageAssetId: { not: null } } }),
  ]);
  return `${total}:${deleted}:${galleryRefs}:${heroRefs}:${representativeRefs}`;
}

/** Bounded scan for the "غير مستخدمة (N)" filter chip count — same MAX_SCAN cap the page read
 * in `app/api/admin/media/route.ts` uses; at catalog scale this covers the whole table. */
async function countUnused(where: Prisma.MediaAssetWhereInput): Promise<number> {
  const { getAssetUsage } = await import("./usage");
  let unused = 0;
  let cursorId: string | undefined;
  let scanned = 0;
  while (scanned < MAX_SCAN) {
    const batch: AssetIdRow[] = await prisma.mediaAsset.findMany({
      where: { ...where, deletedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: SCAN_BATCH,
      select: { id: true, url: true, publicId: true },
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    if (batch.length === 0) break;
    scanned += batch.length;
    cursorId = batch[batch.length - 1].id;
    const usageMap = await getAssetUsage(batch);
    unused += batch.filter((a) => (usageMap.get(a.id) ?? []).length === 0).length;
    if (batch.length < SCAN_BATCH) break;
  }
  return unused;
}

/** `{ missing, unused }` for the given filter `where`, cached per-filter for 60s (or until the
 * data version proxy above changes, whichever is sooner). */
export async function getMediaCounts(where: Prisma.MediaAssetWhereInput): Promise<{ missing: number; unused: number }> {
  const version = await mediaDataVersion();
  const key = `${version}::${JSON.stringify(where)}`;
  const now = Date.now();

  const cached = mediaCountsCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const [missing, unused] = await Promise.all([
    prisma.mediaAsset.count({ where: { ...where, deletedAt: { not: null } } }),
    countUnused(where),
  ]);
  const value = { missing, unused };

  // The data version changed -> every entry from the previous version is stale; drop them so
  // the map doesn't grow across versions indefinitely.
  for (const [k] of mediaCountsCache) {
    if (!k.startsWith(`${version}::`)) mediaCountsCache.delete(k);
  }
  if (mediaCountsCache.size >= MEDIA_COUNTS_CACHE_MAX_ENTRIES) {
    const oldestKey = mediaCountsCache.keys().next().value;
    if (oldestKey !== undefined) mediaCountsCache.delete(oldestKey);
  }
  mediaCountsCache.set(key, { expiresAt: now + MEDIA_COUNTS_CACHE_TTL_MS, value });
  return value;
}

/** Test-only: clears the in-process cache so a unit test doesn't leak state into the next. */
export function _resetMediaCountsCacheForTests(): void {
  mediaCountsCache.clear();
}
