/** Backlog 10.52 — unread-count cache: hit/miss, dirty grace boundary, Redis failures. */
import { describe, it, expect, beforeEach, vi } from "vitest";

const store = new Map<string, unknown>();
const state = { failReads: false, failWrites: false };
const count = vi.fn(async () => 7);

vi.mock("@/lib/redis", () => {
  const fake = {
    pipeline() {
      const ops: Array<() => unknown> = [];
      const p = {
        get(k: string) {
          ops.push(() => store.get(k) ?? null);
          return p;
        },
        set(k: string, v: unknown) {
          ops.push(() => {
            store.set(k, v);
            return "OK";
          });
          return p;
        },
        async exec() {
          if (state.failReads || state.failWrites) throw new Error("redis down");
          return ops.map((o) => o());
        },
      };
      return p;
    },
    async set(k: string, v: unknown) {
      if (state.failWrites) throw new Error("redis down");
      store.set(k, v);
      return "OK";
    },
    async del(k: string) {
      store.delete(k);
    },
  };
  return { redis: fake, default: fake };
});
vi.mock("@/lib/db", () => ({ prisma: { notification: { count: () => count() } } }));

import {
  getUnreadCountCached,
  markUnreadDirty,
  isCacheValid,
  unreadKey,
  dirtyKey,
  DIRTY_GRACE_MS,
} from "./unread-cache";

beforeEach(() => {
  store.clear();
  state.failReads = false;
  state.failWrites = false;
  count.mockClear();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("isCacheValid", () => {
  it("is valid only when at > dirty + 5000 (strict)", () => {
    expect(isCacheValid(10_000, null)).toBe(true);
    expect(isCacheValid(1_000 + DIRTY_GRACE_MS + 1, 1_000)).toBe(true);
    expect(isCacheValid(1_000 + DIRTY_GRACE_MS, 1_000)).toBe(false);
    expect(isCacheValid(1_000 + DIRTY_GRACE_MS - 1, 1_000)).toBe(false);
  });
});

describe("getUnreadCountCached", () => {
  it("miss: counts in Postgres, writes the cache with the pre-count timestamp", async () => {
    expect(await getUnreadCountCached("u1", () => 123)).toBe(7);
    expect(count).toHaveBeenCalledTimes(1);
    expect(JSON.parse(store.get(unreadKey("u1")) as string)).toEqual({ count: 7, at: 123 });
  });

  it("hit: returns the cached count with zero Postgres queries", async () => {
    store.set(unreadKey("u1"), JSON.stringify({ count: 3, at: 50_000 }));
    expect(await getUnreadCountCached("u1")).toBe(3);
    expect(count).not.toHaveBeenCalled();
  });

  it("hit also works when Upstash auto-parsed the JSON into an object", async () => {
    store.set(unreadKey("u1"), { count: 4, at: 50_000 });
    expect(await getUnreadCountCached("u1")).toBe(4);
    expect(count).not.toHaveBeenCalled();
  });

  it("dirty within the grace window: cache ignored, recounted", async () => {
    store.set(unreadKey("u1"), JSON.stringify({ count: 3, at: 10_000 + DIRTY_GRACE_MS }));
    store.set(dirtyKey("u1"), 10_000);
    expect(await getUnreadCountCached("u1", () => 99_999)).toBe(7);
    expect(count).toHaveBeenCalledTimes(1);
  });

  it("dirty older than the cache by more than the grace: cache used", async () => {
    store.set(unreadKey("u1"), JSON.stringify({ count: 3, at: 10_000 + DIRTY_GRACE_MS + 1 }));
    store.set(dirtyKey("u1"), 10_000);
    expect(await getUnreadCountCached("u1")).toBe(3);
    expect(count).not.toHaveBeenCalled();
  });

  it("dirty newer than the cache: recounted", async () => {
    store.set(unreadKey("u1"), JSON.stringify({ count: 3, at: 10_000 }));
    store.set(dirtyKey("u1"), 20_000);
    expect(await getUnreadCountCached("u1", () => 30_000)).toBe(7);
  });

  it("Redis read failure falls back to Postgres", async () => {
    state.failReads = true;
    expect(await getUnreadCountCached("u1")).toBe(7);
  });

  it("Redis write failure still returns the count", async () => {
    state.failWrites = true;
    expect(await getUnreadCountCached("u1")).toBe(7);
  });
});

describe("markUnreadDirty", () => {
  it("sets a dirty timestamp per user", async () => {
    await markUnreadDirty(["a", "b"], () => 555);
    expect(store.get(dirtyKey("a"))).toBe(555);
    expect(store.get(dirtyKey("b"))).toBe(555);
  });

  it("never throws when Redis fails", async () => {
    state.failWrites = true;
    await expect(markUnreadDirty(["a"])).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
