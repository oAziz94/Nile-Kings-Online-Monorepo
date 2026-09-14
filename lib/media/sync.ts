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
