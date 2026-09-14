/**
 * Cloudinary reconcile (backlog 9.8a (d)): pure diff/adoption logic, kept separate from the
 * route/Cloudinary Admin API call so it is Vitest-able on a fake listing. The route
 * (`app/api/admin/media/sync/route.ts`) does the actual paginated `GET /resources/image`
 * calls and the writes; this module only decides what should happen given a listing and the
 * current DB state.
 */

export type CloudinaryResource = {
  public_id: string;
  secure_url: string;
  width?: number;
  height?: number;
  bytes?: number;
  format?: string;
  folder?: string;
};

export type SyncDiff = {
  /** Resources present in Cloudinary but not yet registered — imported as unused. */
  toImport: CloudinaryResource[];
  /** Registered, not-yet-deleted asset public ids that are no longer in Cloudinary. */
  missingPublicIds: string[];
};

/**
 * `resources` is the full listing for the scanned folders (paginated by the caller).
 * `registered` is every non-deleted `MediaAsset` row whose folder is one of those scanned
 * (so an asset outside the synced prefixes is never wrongly marked missing).
 */
export function computeSyncDiff(
  resources: CloudinaryResource[],
  registered: { publicId: string }[]
): SyncDiff {
  const resourceIds = new Set(resources.map((r) => r.public_id));
  const registeredIds = new Set(registered.map((r) => r.publicId));

  const toImport = resources.filter((r) => !registeredIds.has(r.public_id));
  const missingPublicIds = [...registeredIds].filter((id) => !resourceIds.has(id));

  return { toImport, missingPublicIds };
}

/**
 * The "missing" half of `computeSyncDiff`, factored out so the resumable route (backlog 9.8a
 * verifier fix — a listing split across several 45s-budgeted requests, `SiteSetting
 * .mediaSyncProgress` persisting the running `publicId` set between them) can compute it once,
 * at the end, from the *union* of every page it has seen across however many requests that
 * took — never from a single page, which would wrongly flag every not-yet-scanned registered
 * asset as missing. Equivalent to `computeSyncDiff(allResourcesInOneListing, registered)
 * .missingPublicIds` when `seenPublicIds` is the full listing's public ids in any order/split
 * (`sync.test.ts` asserts this equivalence directly).
 */
export function missingFromSeen(
  registered: { publicId: string }[],
  seenPublicIds: Iterable<string>
): string[] {
  const seen = new Set(seenPublicIds);
  return registered.filter((r) => !seen.has(r.publicId)).map((r) => r.publicId);
}

export type LegacyUrlRow = { id: string; url: string };

/** One row per legacy `Product`/`Variant`/`VariantImage` whose url matches a registered
 * asset's url but whose id column is still null — the adoption this pure function computes. */
export function computeAdoptionMatches(
  legacyRows: LegacyUrlRow[],
  assetIdByUrl: Map<string, string>
): { rowId: string; assetId: string }[] {
  const matches: { rowId: string; assetId: string }[] = [];
  for (const row of legacyRows) {
    const assetId = assetIdByUrl.get(row.url);
    if (assetId) matches.push({ rowId: row.id, assetId });
  }
  return matches;
}
