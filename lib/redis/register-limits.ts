/**
 * Registration rate limiting via Upstash Redis.
 *
 * `/api/auth/register` previously had no rate limiting at all — flagged as a production bug
 * fixed inside the redesign, see `docs/redesign/04-decisions.md` 2026-09-10 "Phase 0 findings
 * triage" and the `(auth)` 4.2 backlog entry.
 *
 * Mirrors `lib/redis/login-limits.ts`'s fixed-hour-window counter mechanism exactly (same
 * `hourKey` shape, same thresholds/severity) rather than inventing a different approach. The
 * one thing that differs from login is *what* counts as a recorded failure: registration has
 * no "wrong password" concept, and a phone can only ever complete a *successful* registration
 * once (the DB's phone-uniqueness constraint prevents a second one). The meaningful attack
 * surface here is the "هذا الرقم مسجّل مسبقاً" (already registered) branch — repeatedly
 * probing it is exactly how an attacker enumerates which phone numbers already have accounts,
 * the same class of concern login's phone/IP counters guard against for wrong-password
 * attempts. Plain client-validation misses (missing name, short password, bad phone format)
 * are not counted, matching login's own choice to only record failures that reached real
 * account data.
 *
 * - Per-phone: rl:register:phone:{phone}:{yyyyMMddHH}, capped at PHONE_LIMIT_PER_HOUR.
 * - Per-IP:    rl:register:ip:{ip}:{yyyyMMddHH}, capped at IP_LIMIT_PER_HOUR (looser — one IP
 *   can legitimately represent many shoppers behind NAT/a shared connection/mobile carrier).
 */

import { redis } from "@/lib/redis";

const PHONE_LIMIT_PER_HOUR = 10;
const IP_LIMIT_PER_HOUR = 30;

function hourKey(prefix: string, id: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const H = String(now.getHours()).padStart(2, "0");
  return `${prefix}:${id}:${y}${M}${d}${H}`;
}

/** True if this phone hasn't yet hit the per-hour failed-attempt cap. Does not increment. */
export async function checkRegisterPhoneRateLimit(phone: string): Promise<boolean> {
  const raw = await redis.get(hourKey("rl:register:phone", phone));
  const current = typeof raw === "number" ? raw : 0;
  return current < PHONE_LIMIT_PER_HOUR;
}

/** True if this IP hasn't yet hit the per-hour failed-attempt cap. Does not increment. */
export async function checkRegisterIpRateLimit(ip: string): Promise<boolean> {
  const raw = await redis.get(hourKey("rl:register:ip", ip));
  const current = typeof raw === "number" ? raw : 0;
  return current < IP_LIMIT_PER_HOUR;
}

/** Record a failed registration attempt against both counters. Call after any non-success outcome that reached account data (see file docstring). */
export async function recordFailedRegister(phone: string, ip: string | null): Promise<void> {
  const phoneKey = hourKey("rl:register:phone", phone);
  const phoneCount = await redis.incr(phoneKey);
  if (phoneCount === 1) await redis.expire(phoneKey, 3600);

  if (ip) {
    const ipKey = hourKey("rl:register:ip", ip);
    const ipCount = await redis.incr(ipKey);
    if (ipCount === 1) await redis.expire(ipKey, 3600);
  }
}

/** Clear the per-phone failed-attempt counter. Call after a successful registration (kept for symmetry with login-limits.ts, even though a phone can only ever succeed once). */
export async function clearRegisterAttempts(phone: string): Promise<void> {
  await redis.del(hourKey("rl:register:phone", phone));
}
