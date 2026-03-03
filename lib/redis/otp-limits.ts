/**
 * OTP rate limiting and cooldown via Upstash Redis.
 * - Fixed window keys: rl:otp:phone:{phone}:{yyyyMMddHH}, rl:otp:ip:{ip}:{yyyyMMddHH}
 * - Cooldown: otp:cooldown:{phone} TTL 60s
 * - Verify lock: otp:lock:{phone} TTL 15min, also persisted in DB (OTPRequest.lockedUntil)
 */

import { redis } from "@/lib/redis";

const DEFAULT_COOLDOWN_TTL_SEC = 60;
const DEFAULT_LOCK_TTL_SEC = 15 * 60; // 15 minutes
const PHONE_LIMIT_PER_HOUR = 5;
const IP_LIMIT_PER_HOUR = 20;

function hourKey(prefix: string, id: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const M = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const H = String(now.getHours()).padStart(2, "0");
  return `${prefix}:${id}:${y}${M}${d}${H}`;
}

export function otpCooldownKey(phone: string): string {
  return `otp:cooldown:${phone}`;
}

export function otpLockKey(phone: string): string {
  return `otp:lock:${phone}`;
}

/** Check if phone is in resend cooldown. Returns remaining seconds or 0. */
export async function getCooldownRemaining(phone: string): Promise<number> {
  const key = otpCooldownKey(phone);
  const ttl = await redis.ttl(key);
  return ttl > 0 ? ttl : 0;
}

/** Set resend cooldown. Call after sending OTP. ttlSec defaults to 60. */
export async function setCooldown(phone: string, ttlSec?: number): Promise<void> {
  const ex = ttlSec ?? DEFAULT_COOLDOWN_TTL_SEC;
  await redis.set(otpCooldownKey(phone), "1", { ex });
}

/** Check per-phone rate limit (5/hour). Does not increment. */
export async function checkPhoneRateLimit(phone: string): Promise<{
  allowed: boolean;
  current: number;
  remaining: number;
}> {
  const key = hourKey("rl:otp:phone", phone);
  const raw = await redis.get(key);
  const current = typeof raw === "number" ? raw : 0;
  const remaining = Math.max(0, PHONE_LIMIT_PER_HOUR - current);
  return {
    allowed: current < PHONE_LIMIT_PER_HOUR,
    current,
    remaining,
  };
}

/** Increment per-phone count (call after successfully sending OTP). */
export async function incrementPhoneRateLimit(phone: string): Promise<void> {
  const key = hourKey("rl:otp:phone", phone);
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 3600);
}

/** Check per-IP rate limit (20/hour). Does not increment. */
export async function checkIpRateLimit(ip: string): Promise<{
  allowed: boolean;
  current: number;
  remaining: number;
}> {
  const key = hourKey("rl:otp:ip", ip);
  const raw = await redis.get(key);
  const current = typeof raw === "number" ? raw : 0;
  const remaining = Math.max(0, IP_LIMIT_PER_HOUR - current);
  return {
    allowed: current < IP_LIMIT_PER_HOUR,
    current,
    remaining,
  };
}

/** Increment per-IP count (call after successfully sending OTP). */
export async function incrementIpRateLimit(ip: string): Promise<void> {
  const key = hourKey("rl:otp:ip", ip);
  const n = await redis.incr(key);
  if (n === 1) await redis.expire(key, 3600);
}

/** Check if phone is locked (too many verify attempts). Returns lock expiry (seconds from now) or 0. */
export async function getLockRemaining(phone: string): Promise<number> {
  const key = otpLockKey(phone);
  const ttl = await redis.ttl(key);
  return ttl > 0 ? ttl : 0;
}

/** Set verify lock. Call after max failed attempts. lockTtlSec defaults to 15 min. */
export async function setLock(phone: string, lockTtlSec?: number): Promise<void> {
  const ex = lockTtlSec ?? DEFAULT_LOCK_TTL_SEC;
  await redis.set(otpLockKey(phone), "1", { ex });
}

/** Increment verify attempts in Redis for this phone. lockTtlSec used for key expiry (default 15 min). */
export async function incrementVerifyAttempts(phone: string, lockTtlSec?: number): Promise<number> {
  const key = `otp:verify_attempts:${phone}`;
  const n = await redis.incr(key);
  const ex = lockTtlSec ?? DEFAULT_LOCK_TTL_SEC;
  if (n === 1) await redis.expire(key, ex);
  return n;
}

/** Clear verify attempts (e.g. after successful verify). */
export async function clearVerifyAttempts(phone: string): Promise<void> {
  await redis.del(`otp:verify_attempts:${phone}`);
}
