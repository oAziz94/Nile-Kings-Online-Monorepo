/**
 * Registration OTP: phone -> WhatsApp OTP -> profile -> create account.
 *
 * Modeled closely on lib/auth/forgot-password.ts's request/verify/token structure (per
 * docs/redesign/04-decisions.md 2026-09-10 "WhatsApp OTP via WaPilot" — "mirroring
 * forgot-password's existing phone->OTP->next-step structure as closely as possible rather than
 * inventing a new pattern"). The one structural difference: forgot-password's token gates a
 * *password reset* on an already-existing user; this one gates *account creation* itself, so it
 * carries the verified phone forward to the final profile step without creating a User until the
 * name/email/password are collected.
 */

import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { normalizePhone, requestOtp, verifyOtpForRegister } from "@/lib/auth/otp";
import {
  checkRegisterIpRateLimit,
  checkRegisterPhoneRateLimit,
  recordFailedRegister,
} from "@/lib/redis/register-limits";

const REGISTER_TOKEN_ISSUER = "nile-kings";
const REGISTER_TOKEN_AUDIENCE = "nile-kings-register";
const REGISTER_TOKEN_EXPIRY_SEC = 15 * 60; // 15 minutes, same window as forgot-password's reset token

async function getSecret(): Promise<Uint8Array> {
  return new TextEncoder().encode(env.JWT_SECRET);
}

/** Create a short-lived JWT proving this phone completed WhatsApp OTP verification for registration. */
export async function createRegisterToken(phone: string): Promise<string> {
  const secret = await getSecret();
  return new SignJWT({ phone, purpose: "register_verified" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(REGISTER_TOKEN_ISSUER)
    .setAudience(REGISTER_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + REGISTER_TOKEN_EXPIRY_SEC)
    .sign(secret);
}

/** Verify a register token; returns the verified phone or null. */
export async function verifyRegisterToken(token: string): Promise<string | null> {
  try {
    const secret = await getSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: REGISTER_TOKEN_ISSUER,
      audience: REGISTER_TOKEN_AUDIENCE,
    });
    const phone = payload.phone;
    if (typeof phone !== "string" || payload.purpose !== "register_verified") return null;
    return phone;
  } catch {
    return null;
  }
}

export type RequestRegisterOtpResult =
  | { success: true; cooldownSeconds?: number }
  | { success: false; reason: "already_registered" }
  | { success: false; reason: "invalid_phone" }
  | { success: false; reason: "rate_limited" }
  | { success: false; reason: "cooldown"; cooldownSeconds: number }
  | { success: false; reason: "rate_limit_phone" }
  | { success: false; reason: "rate_limit_ip" }
  | { success: false; reason: "locked"; lockMinutes: number }
  | { success: false; reason: "send_error"; message: string };

/**
 * Request a registration OTP. Checks the phone isn't already registered *before* sending an OTP
 * (avoids wasting a WhatsApp send on a number that will fail at account creation anyway) —
 * preserves register.md's exact "هذا الرقم مسجّل مسبقاً" message and its "any account state,
 * including passwordless OTP-created ones" rule, just surfaced one step earlier in the flow than
 * before. Reuses the same register-limits.ts rate-limit counters 4.2 added for this exact
 * enumeration surface (see that file's docstring), relocated here since this is now where the
 * "already registered" check lives.
 */
export async function requestRegisterOtp(
  phone: string,
  ip: string | null
): Promise<RequestRegisterOtpResult> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { success: false, reason: "invalid_phone" };
  }

  const [phoneAllowed, ipAllowed] = await Promise.all([
    checkRegisterPhoneRateLimit(normalized),
    ip ? checkRegisterIpRateLimit(ip) : Promise.resolve(true),
  ]);
  if (!phoneAllowed || !ipAllowed) {
    return { success: false, reason: "rate_limited" };
  }

  const existing = await prisma.user.findUnique({
    where: { phone: normalized },
    select: { id: true },
  });
  if (existing) {
    await recordFailedRegister(normalized, ip);
    return { success: false, reason: "already_registered" };
  }

  const result = await requestOtp(phone, ip, "register");
  if (result.success) {
    return { success: true, cooldownSeconds: result.cooldownSeconds };
  }
  return result as RequestRegisterOtpResult;
}

/** Verify a registration OTP and return a register token proving phone ownership. */
export async function verifyRegisterOtp(phone: string, code: string, ip: string | null) {
  return verifyOtpForRegister(phone, code, ip, createRegisterToken);
}
