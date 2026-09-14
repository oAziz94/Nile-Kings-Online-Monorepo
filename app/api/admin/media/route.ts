import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { getAssetUsage, summarizeUsage, type AssetUsageEntry } from "@/lib/media/usage";
import { getMediaCounts } from "@/lib/media/counts";
import { getSiteSetting } from "@/lib/settings";

/**
 * GET /api/admin/media — backlog 9.8a (e)/(f), الصور library.
 *
 * Query: q (public id / product name — product name is matched against the usage line, not a
 * column, so it only narrows a page already fetched by id), product (productId), color
 * (colorKey), unused=1 (default library view), missing=1, folder ("products" | "proofs"),
 * from/to (ISO date, inclusive day range on createdAt), cursor (a MediaAsset id), limit
 * (default 50, max 50).
 *
 * Usage is not a column, so "unused"/"missing"/product/colour filtering happens after a batch
 * read rather than in SQL — this scans in bounded pages (200 rows/round, capped at 5,000 rows
 * scanned) until `limit` matches are found or the scan is exhausted, which is fine at this
 * catalog's scale (the canvas placeholder is ~214 assets) and avoids loading the whole table
 * into memory at once.
 */
const SCAN_BATCH = 200;
const MAX_SCAN = 5000;

type AssetRow = {
  id: string;
  publicId: string;
  url: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  format: string | null;
  folder: string;
  alt: string | null;
  createdAt: Date;
  deletedAt: Date | null;
};

function buildWhere(searchParams: URLSearchParams): Prisma.MediaAssetWhereInput {
  const q = (searchParams.get("q") ?? "").trim();
  const folder = searchParams.get("folder");
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;

  const where: Prisma.MediaAssetWhereInput = {};
  if (q) where.publicId = { contains: q, mode: "insensitive" };
  if (folder === "proofs") where.folder = { contains: "routed-proofs" };
  else if (folder === "products") where.folder = { contains: "nile-kings/products" };
  if (from || to) {
    where.createdAt = {
      ...(from && { gte: new Date(from) }),
      ...(to && { lte: new Date(`${to}T23:59:59.999Z`) }),
    };
  }
  return where;
}

function matchesEntity(entries: AssetUsageEntry[], productId: string | null, colorKey: string | null): boolean {
  if (!productId && !colorKey) return true;
  return entries.some((e) => {
    if (e.kind === "proof") return false;
    if (productId && e.productId !== productId) return false;
    if (colorKey) {
      const key = e.kind === "gallery" ? e.colorKey : null;
      if (key !== colorKey) return false;
    }
    return true;
  });
}

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const where = buildWhere(searchParams);
  const unusedOnly = searchParams.get("unused") === "1";
  const missingOnly = searchParams.get("missing") === "1";
  const productId = searchParams.get("product");
  const colorKeyFilter = searchParams.get("color");
  const startCursor = searchParams.get("cursor") ?? undefined;
  const limit = Math.min(Number(searchParams.get("limit") ?? 50) || 50, 50);

  const items: { asset: AssetRow; usage: AssetUsageEntry[] }[] = [];
  let cursorId = startCursor;
  let scanned = 0;
  let exhausted = false;

  while (items.length < limit && scanned < MAX_SCAN) {
    const batch: AssetRow[] = await prisma.mediaAsset.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: SCAN_BATCH,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    });
    if (batch.length === 0) {
      exhausted = true;
      break;
    }
    scanned += batch.length;
    cursorId = batch[batch.length - 1].id;

    const nonDeleted = batch.filter((a) => a.deletedAt === null);
    const usageMap = await getAssetUsage(nonDeleted.map((a) => ({ id: a.id, url: a.url, publicId: a.publicId })));

    for (const a of batch) {
      const isMissing = a.deletedAt !== null;
      const entries = isMissing ? [] : (usageMap.get(a.id) ?? []);
      const isUnused = !isMissing && entries.length === 0;
      if (missingOnly && !isMissing) continue;
      if (unusedOnly && !isUnused) continue;
      if (!matchesEntity(entries, productId, colorKeyFilter)) continue;
      items.push({ asset: a, usage: entries });
      if (items.length >= limit) break;
    }

    if (batch.length < SCAN_BATCH) {
      exhausted = true;
      break;
    }
  }

  const lastSyncAt = await getSiteSetting("mediaLastSyncAt");
  // Backlog 9.10 — 60s in-memory cache (see lib/media/counts.ts); the same scan this route
  // used to run inline on every request.
  const { missing: missingCount, unused: unusedCount } = await getMediaCounts(where);

  return apiSuccess({
    counts: { missing: missingCount, unused: unusedCount },
    items: items.map(({ asset, usage }) => ({
      id: asset.id,
      publicId: asset.publicId,
      url: asset.url,
      thumbUrl: toThumbUrl(asset.url),
      width: asset.width,
      height: asset.height,
      bytes: asset.bytes,
      format: asset.format,
      folder: asset.folder,
      alt: asset.alt,
      createdAt: asset.createdAt,
      deletedAt: asset.deletedAt,
      usage,
      usageLabel: asset.deletedAt ? "مسجّلة والملف غير موجود" : summarizeUsage(usage),
    })),
    nextCursor: exhausted ? null : cursorId,
    lastSyncAt,
  });
}

/** Cloudinary transformation for the grid thumbnail (spec: `c_fill,w_320,h_300,q_auto,f_auto`). */
function toThumbUrl(url: string): string {
  const marker = "/upload/";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  return `${url.slice(0, idx + marker.length)}c_fill,w_320,h_300,q_auto,f_auto/${url.slice(idx + marker.length)}`;
}
