/**
 * Backlog 10.52 — Redis-backed unread count for the bell's 20 s poll, so an open dashboard tab
 * costs zero Postgres queries (Neon bills compute hours; see 02-infra-baseline.md).
 *
 * Keys (both TTL 15 min):
 * - `notif:unread:<userId>` = JSON `{ count, at }` — the cached count and when it was computed.
 * - `notif:dirty:<userId>`  = ms timestamp of the last write that may have changed the count.
 *
 * Rule: the cache is valid only when `at > dirty + 5000`. `notify()` marks dirty INSIDE the
 * caller's transaction, so a poll can run between the mark and the commit, count the pre-commit
 * state and cache it. The 5 s grace keeps such a cache entry invalid until it was computed well
 * after the mark, i.e. after the transaction (a few ms-seconds) has committed.
 */
// Loaded lazily: importing `@/lib/redis` evaluates `@/lib/env` (full validation), and this
// module is reachable from `notify()` → `lib/rerouting/assign` → Playwright specs that run
// without the server env. Only the request-time code paths need the client.
async function getRedis() {
  const mod = await import("@/lib/redis");
  return mod.redis;
}
import { prisma } from "@/lib/db";

export const UNREAD_TTL_SEC = 15 * 60;
export const DIRTY_GRACE_MS = 5_000;
/** Upper bound on how long an invalidation may hold the caller (notify() runs inside an order
 * transaction and the Upstash client has no request timeout of its own). On expiry the write is
 * abandoned — the badge is stale for ≤15 min, the order is not delayed. */
export const WRITE_TIMEOUT_MS = 2_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export function unreadKey(userId: string): string {
  return `notif:unread:${userId}`;
}
export function dirtyKey(userId: string): string {
  return `notif:dirty:${userId}`;
}

type CacheEntry = { count: number; at: number };

function parseEntry(raw: unknown): CacheEntry | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const { count, at } = v as Record<string, unknown>;
  return typeof count === "number" && typeof at === "number" ? { count, at } : null;
}

/** Pure validity rule, exported for the boundary unit tests. */
export function isCacheValid(at: number, dirty: number | null): boolean {
  return dirty === null || at > dirty + DIRTY_GRACE_MS;
}

export async function getUnreadCountCached(userId: string, now: () => number = Date.now): Promise<number> {
  try {
    const [rawCache, rawDirty] = await (await getRedis()).pipeline().get(unreadKey(userId)).get(dirtyKey(userId)).exec();
    const entry = parseEntry(rawCache);
    const dirtyNum = rawDirty === null || rawDirty === undefined ? null : Number(rawDirty);
    const dirty = dirtyNum !== null && Number.isFinite(dirtyNum) ? dirtyNum : null;
    if (entry && isCacheValid(entry.at, dirty)) return entry.count;
  } catch (err) {
    console.error("[notifications] unread cache read failed", err);
  }

  // `at` is taken BEFORE the count so a mark landing during the query always compares newer.
  const at = now();
  const count = await prisma.notification.count({ where: { userId, readAt: null } });
  try {
    await (await getRedis()).set(unreadKey(userId), JSON.stringify({ count, at }), { ex: UNREAD_TTL_SEC });
  } catch (err) {
    console.error("[notifications] unread cache write failed", err);
  }
  return count;
}

/** Never throws: a Redis hiccup means a stale badge for <= 15 min, never a failed order. */
export async function markUnreadDirty(userIds: string[], now: () => number = Date.now): Promise<void> {
  if (userIds.length === 0) return;
  try {
    const ts = now();
    const pipe = (await getRedis()).pipeline();
    for (const id of userIds) pipe.set(dirtyKey(id), ts, { ex: UNREAD_TTL_SEC });
    await withTimeout(pipe.exec(), WRITE_TIMEOUT_MS, "markUnreadDirty");
  } catch (err) {
    console.error("[notifications] markUnreadDirty failed", err);
  }
}

/** Drops the cached count (read route: badge must drop immediately). Never throws. */
export async function clearUnreadCache(userId: string): Promise<void> {
  try {
    await withTimeout((await getRedis()).del(unreadKey(userId)), WRITE_TIMEOUT_MS, "clearUnreadCache");
  } catch (err) {
    console.error("[notifications] clearUnreadCache failed", err);
  }
}
