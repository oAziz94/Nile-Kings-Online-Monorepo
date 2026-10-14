/**
 * Client-side bulk delete for the الصور library (backlog 10.43). Dedupes ids, runs at most
 * `concurrency` DELETE requests at once, and returns one summary so the caller shows a single
 * toast. `alreadyDeleted` answers count as deleted (the asset is gone, which is the intent).
 */
export type MediaDeleteSummary = { deleted: number; failed: number; firstError: string | null };

export async function deleteMediaAssets(ids: string[], concurrency = 4): Promise<MediaDeleteSummary> {
  const unique = Array.from(new Set(ids));
  let deleted = 0;
  let failed = 0;
  let firstError: string | null = null;
  let next = 0;

  const worker = async () => {
    while (next < unique.length) {
      const id = unique[next++];
      try {
        const res = await fetch(`/api/admin/media/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.success) deleted++;
        else {
          failed++;
          firstError ??= json?.error?.message ?? "تعذّر الحذف";
        }
      } catch {
        failed++;
        firstError ??= "تعذّر الحذف";
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, worker));
  return { deleted, failed, firstError };
}

/** The single toast text for a finished bulk delete. */
export function mediaDeleteToast(s: MediaDeleteSummary): { title: string; description?: string; variant?: "destructive" } {
  if (s.failed === 0) return { title: `تم حذف ${s.deleted} صورة` };
  return {
    title: s.deleted > 0 ? `تم حذف ${s.deleted} صورة، وتعذر حذف ${s.failed}` : `تعذر حذف ${s.failed}`,
    description: s.firstError ?? undefined,
    variant: "destructive",
  };
}
