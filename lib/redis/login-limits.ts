/**
 * Password-login rate limiting via Upstash Redis.
 *
 * `/api/auth/login` previously had no rate limiting at all, unlike the OTP endpoints
 * (phone/IP hourly limits + a verify-attempt lock, see `lib/redis/otp-limits.ts`) — flagged
 * as a production bug fixed inside the redesign, see `docs/redesign/04-decisions.md`
 * 2026-09-10 "Phase 0 findings triage" and the `(auth)` 4.1 backlog entry.
 *
 * Mirrors otp-limits.ts's fixed-hour-window counter mechanism (same `hourKey` shape) rather
 * than inventing a new approach, but counts *failed login attempts* (wrong password / unknown
 * phone) instead of *requests sent* — the counter only grows on failure, and a successful
 * login clears the per-phone counter so a shopper who mistypes their password a couple of
 * times isn't left stuck near the cap for the rest of the hour.
 *
 * - Per-phone: rl:login:phone:{phone}:{yyyyMMddHH}, capped at PHONE_LIMIT_PER_HOUR.
 * - Per-IP:    rl:login:ip:{ip}:{yyyyMMddHH}, capped at IP_LIMIT_PER_HOUR (looser — one IP can
 *   legitimately represent many shoppers behind NAT/a shared connection/mobile carrier).
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
export async function checkLoginPhoneRateLimit(phone: string): Promise<boolean> {
  const raw = await redis.get(hourKey("rl:login:phone", phone));
  const current = typeof raw === "number" ? raw : 0;
  return current < PHONE_LIMIT_PER_HOUR;
}

/** True if this IP hasn't yet hit the per-hour failed-attempt cap. Does not increment. */
export async function checkLoginIpRateLimit(ip: string): Promise<boolean> {
  const raw = await redis.get(hourKey("rl:login:ip", ip));
  const current = typeof raw === "number" ? raw : 0;
  return current < IP_LIMIT_PER_HOUR;
}

/** Record a failed login attempt against both counters. Call after any non-success outcome. */
export async function recordFailedLogin(phone: string, ip: string | null): Promise<void> {
  const phoneKey = hourKey("rl:login:phone", phone);
  const phoneCount = await redis.incr(phoneKey);
  if (phoneCount === 1) await redis.expire(phoneKey, 3600);

  if (ip) {
    const ipKey = hourKey("rl:login:ip", ip);
    const ipCount = await redis.incr(ipKey);
    if (ipCount === 1) await redis.expire(ipKey, 3600);
  }
}

/** Clear the per-phone failed-attempt counter. Call after a successful login. */
export async function clearLoginAttempts(phone: string): Promise<void> {
  await redis.del(hourKey("rl:login:phone", phone));
}
