/**
 * Optional Redis cache for admin analytics (5 min TTL).
 * Skip cache when date range is provided (user wants fresh data).
 * Invalidation uses a version key so we don't need keys()/scan.
 */

import { redis } from "@/lib/redis";

const ANALYTICS_TTL_SEC = 5 * 60; // 5 minutes
const PREFIX = "analytics:";
const VERSION_KEY = `${PREFIX}v`;

async function getVersion(): Promise<number> {
  try {
    const v = await redis.get(VERSION_KEY);
    return typeof v === "string" ? parseInt(v, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

function cacheKey(version: number, segment: string, params: string): string {
  return `${PREFIX}${version}:${segment}:${params}`;
}

export async function getCached<T>(segment: string, params: string): Promise<T | null> {
  try {
    const version = await getVersion();
    const raw = await redis.get(cacheKey(version, segment, params));
    if (raw == null) return null;
    return JSON.parse(raw as string) as T;
  } catch {
    return null;
  }
}

export async function setCached(segment: string, params: string, value: unknown): Promise<void> {
  try {
    const version = await getVersion();
    await redis.set(cacheKey(version, segment, params), JSON.stringify(value), {
      ex: ANALYTICS_TTL_SEC,
    });
  } catch {
    // ignore
  }
}

/** Invalidate analytics caches (e.g. after new order). Bump version so existing keys are ignored. */
export async function invalidateAnalyticsCache(): Promise<void> {
  try {
    const v = await getVersion();
    await redis.set(VERSION_KEY, String(v + 1), { ex: 60 * 60 * 24 }); // version key lives 24h
  } catch {
    // ignore
  }
}
