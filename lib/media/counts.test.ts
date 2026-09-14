import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Backlog 9.10 — `getMediaCounts`'s 60-second in-memory cache, keyed by a proxy for
 * `MediaAsset`'s (nonexistent) `updatedAt`: total row count + how many carry `deletedAt`
 * (see lib/media/counts.ts's own header comment for why). `mediaAsset.count` is called once
 * for the data-version check and once more per uncached compute (missingCount) — this test
 * only cares about `mediaAsset.findMany` (the unused-count scan), a clean proxy for "did the
 * expensive path actually run".
 */

let assets: { id: string; deletedAt: Date | null }[] = [{ id: "a1", deletedAt: null }];
let findManyCalls = 0;

vi.mock("@/lib/db", () => ({
  get prisma() {
    return {
      mediaAsset: {
        count: async ({ where }: { where?: { deletedAt?: { not: null } } } = {}) => {
          if (where?.deletedAt) return assets.filter((a) => a.deletedAt !== null).length;
          return assets.length;
        },
        findMany: async () => {
          findManyCalls += 1;
          return assets.filter((a) => a.deletedAt === null).map((a) => ({ id: a.id, url: `https://x/${a.id}`, publicId: a.id }));
        },
      },
    };
  },
}));

vi.mock("./usage", () => ({
  getAssetUsage: async () => new Map(),
}));

const { getMediaCounts, _resetMediaCountsCacheForTests } = await import("./counts");

beforeEach(() => {
  assets = [{ id: "a1", deletedAt: null }];
  findManyCalls = 0;
  _resetMediaCountsCacheForTests();
});

describe("getMediaCounts cache", () => {
  it("reuses the cached result for the same filter when nothing changed", async () => {
    await getMediaCounts({});
    await getMediaCounts({});
    await getMediaCounts({});
    expect(findManyCalls).toBe(1);
  });

  it("recomputes once the row count or deleted count changes (a new upload / a reconcile)", async () => {
    await getMediaCounts({});
    expect(findManyCalls).toBe(1);

    assets.push({ id: "a2", deletedAt: null }); // a new upload
    await getMediaCounts({});
    expect(findManyCalls).toBe(2);

    assets[0].deletedAt = new Date(); // the Cloudinary reconcile marking a2... a1 missing
    await getMediaCounts({});
    expect(findManyCalls).toBe(3);
  });

  it("keeps separate cache entries per filter", async () => {
    await getMediaCounts({});
    await getMediaCounts({ folder: { contains: "proofs" } });
    expect(findManyCalls).toBe(2);
    await getMediaCounts({});
    await getMediaCounts({ folder: { contains: "proofs" } });
    expect(findManyCalls).toBe(2);
  });

  it("recomputes after the 60s TTL even with the same data version", async () => {
    vi.useFakeTimers();
    try {
      await getMediaCounts({});
      expect(findManyCalls).toBe(1);
      vi.advanceTimersByTime(61_000);
      await getMediaCounts({});
      expect(findManyCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
