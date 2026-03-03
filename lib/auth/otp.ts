/**
 * OTP: 6-digit numeric, expiry/cooldown/lock from admin settings (getOtpRules).
 * Store hash (sha256+salt) in DB. Never return OTP.
 */

import crypto from "node:crypto";
import twilio from "twilio";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { getOtpRules } from "@/lib/settings";
import {
  getCooldownRemaining,
  setCooldown,
  checkPhoneRateLimit,
  checkIpRateLimit,
  incrementPhoneRateLimit,
  incrementIpRateLimit,
  getLockRemaining,
  setLock,
  incrementVerifyAttempts,
  clearVerifyAttempts,
} from "@/lib/redis/otp-limits";

const OTP_SALT = env.JWT_SECRET.slice(0, 16); // reuse secret for salt, not the raw JWT

function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(OTP_SALT + code).digest("hex");
}

function generateOtp(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

export async function logOtpEvent(
  phone: string,
  event: "request" | "verify_success" | "verify_fail",
  ip: string | null,
  outcome: string | null
): Promise<void> {
  await prisma.otpAuditLog.create({
    data: { phone, event, ip, outcome },
  });
}

/** Normalize E.164-ish: ensure +20 for Egypt if 0-prefixed. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("20") && digits.length >= 11) return `+${digits}`;
  if (digits.startsWith("0") && digits.length >= 10) return `+20${digits.slice(1)}`;
  if (digits.length >= 10) return `+${digits}`;
  return `+20${digits}`;
}

export type RequestOtpResult =
  | { success: true; cooldownSeconds?: number }
  | { success: false; reason: "cooldown"; cooldownSeconds: number }
  | { success: false; reason: "rate_limit_phone" }
  | { success: false; reason: "rate_limit_ip" }
  | { success: false; reason: "locked"; lockMinutes: number }
  | { success: false; reason: "twilio_error"; message: string };

/** Request OTP: rate limits, cooldown, lock check; send via Twilio; store hash in DB; set cooldown. */
export async function requestOtp(
  phone: string,
  ip: string | null
): Promise<RequestOtpResult> {
  const normalized = normalizePhone(phone);
  const rules = await getOtpRules();
  const cooldownSec = rules.cooldownSeconds;
  const expiryMs = rules.expiryMinutes * 60 * 1000;

  const lockRem = await getLockRemaining(normalized);
  if (lockRem > 0) {
    await logOtpEvent(normalized, "request", ip, "locked");
    return {
      success: false,
      reason: "locked",
      lockMinutes: Math.ceil(lockRem / 60),
    };
  }

  const cooldownRem = await getCooldownRemaining(normalized);
  if (cooldownRem > 0) {
    await logOtpEvent(normalized, "request", ip, "cooldown");
    return {
      success: false,
      reason: "cooldown",
      cooldownSeconds: cooldownRem,
    };
  }

  const phoneLimit = await checkPhoneRateLimit(normalized);
  if (!phoneLimit.allowed) {
    await logOtpEvent(normalized, "request", ip, "rate_limit_phone");
    return { success: false, reason: "rate_limit_phone" };
  }

  if (ip) {
    const ipLimit = await checkIpRateLimit(ip);
    if (!ipLimit.allowed) {
      await logOtpEvent(normalized, "request", ip, "rate_limit_ip");
      return { success: false, reason: "rate_limit_ip" };
    }
  }

  const code = generateOtp();
  const codeHash = hashOtp(code);
  const expiresAt = new Date(Date.now() + expiryMs);

  try {
    const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: `رمز التحقق نايل كينجز: ${code}`,
      from: env.TWILIO_FROM,
      to: normalized,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Twilio error";
    await logOtpEvent(normalized, "request", ip, `twilio_error: ${message}`);
    return { success: false, reason: "twilio_error", message };
  }

  await clearVerifyAttempts(normalized); // new OTP = reset verify attempts
  await prisma.oTPRequest.create({
    data: {
      phone: normalized,
      codeHash,
      expiresAt,
      attempts: 0,
    },
  });

  await setCooldown(normalized, cooldownSec);
  await incrementPhoneRateLimit(normalized);
  if (ip) await incrementIpRateLimit(ip);
  await logOtpEvent(normalized, "request", ip, "sent");

  return { success: true, cooldownSeconds: cooldownSec };
}

export type VerifyOtpResult =
  | { success: true; userId: string; role: "CUSTOMER" | "ADMIN" }
  | { success: false; reason: "locked"; lockMinutes: number }
  | { success: false; reason: "invalid" }
  | { success: false; reason: "expired" }
  | { success: false; reason: "too_many_attempts"; lockMinutes: number };

/** Verify OTP: check lock, attempts, expiry; compare hash; create/find user; clear attempts; set lock on max fail. */
export async function verifyOtp(
  phone: string,
  code: string,
  _ip: string | null
): Promise<VerifyOtpResult> {
  const normalized = normalizePhone(phone);
  const rules = await getOtpRules();
  const maxAttempts = rules.maxVerifyAttempts;
  const lockMinutes = rules.lockMinutes;
  const lockTtlSec = lockMinutes * 60;

  const trimmed = code.replace(/\D/g, "").slice(0, 6);
  if (trimmed.length !== 6) {
    await logOtpEvent(normalized, "verify_fail", _ip, "invalid_format");
    return { success: false, reason: "invalid" };
  }

  const lockRem = await getLockRemaining(normalized);
  if (lockRem > 0) {
    await logOtpEvent(normalized, "verify_fail", _ip, "locked");
    return {
      success: false,
      reason: "locked",
      lockMinutes: Math.ceil(lockRem / 60),
    };
  }

  const record = await prisma.oTPRequest.findFirst({
    where: { phone: normalized },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    await logOtpEvent(normalized, "verify_fail", _ip, "no_request");
    return { success: false, reason: "invalid" };
  }

  if (record.lockedUntil && record.lockedUntil > new Date()) {
    await logOtpEvent(normalized, "verify_fail", _ip, "locked");
    return {
      success: false,
      reason: "locked",
      lockMinutes: Math.ceil((record.lockedUntil.getTime() - Date.now()) / 60000),
    };
  }

  if (record.expiresAt < new Date()) {
    await logOtpEvent(normalized, "verify_fail", _ip, "expired");
    return { success: false, reason: "expired" };
  }

  const attempts = await incrementVerifyAttempts(normalized, lockTtlSec);
  if (attempts > maxAttempts) {
    const lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
    await prisma.oTPRequest.update({
      where: { id: record.id },
      data: { lockedUntil },
    });
    await setLock(normalized, lockTtlSec);
    await logOtpEvent(normalized, "verify_fail", _ip, "too_many_attempts");
    return {
      success: false,
      reason: "too_many_attempts",
      lockMinutes,
    };
  }

  const codeHash = hashOtp(trimmed);
  if (codeHash !== record.codeHash) {
    await logOtpEvent(normalized, "verify_fail", _ip, "invalid");
    return { success: false, reason: "invalid" };
  }

  await clearVerifyAttempts(normalized);

  const admin = await prisma.adminPhone.findUnique({
    where: { phone: normalized },
  });
  const role = admin ? "ADMIN" : "CUSTOMER";

  let user = await prisma.user.findUnique({
    where: { phone: normalized },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        phone: normalized,
        role: admin ? "ADMIN" : "CUSTOMER",
      },
    });
  } else if (admin && user.role !== "ADMIN") {
    user = await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
    });
  }

  await logOtpEvent(normalized, "verify_success", _ip, "ok");
  return {
    success: true,
    userId: user.id,
    role: user.role as "CUSTOMER" | "ADMIN",
  };
}

export type VerifyOtpForRegistrationResult =
  | { success: true; phone: string; role: "CUSTOMER" | "ADMIN" }
  | { success: false; reason: "locked"; lockMinutes: number }
  | { success: false; reason: "invalid" }
  | { success: false; reason: "expired" }
  | { success: false; reason: "too_many_attempts"; lockMinutes: number };

/** Verify OTP only (for registration). Does not create user. Returns phone + role on success. */
export async function verifyOtpForRegistration(
  phone: string,
  code: string,
  _ip: string | null
): Promise<VerifyOtpForRegistrationResult> {
  const normalized = normalizePhone(phone);
  const rules = await getOtpRules();
  const maxAttempts = rules.maxVerifyAttempts;
  const lockMinutes = rules.lockMinutes;
  const lockTtlSec = lockMinutes * 60;

  const trimmed = code.replace(/\D/g, "").slice(0, 6);
  if (trimmed.length !== 6) {
    await logOtpEvent(normalized, "verify_fail", _ip, "invalid_format");
    return { success: false, reason: "invalid" };
  }

  const lockRem = await getLockRemaining(normalized);
  if (lockRem > 0) {
    await logOtpEvent(normalized, "verify_fail", _ip, "locked");
    return {
      success: false,
      reason: "locked",
      lockMinutes: Math.ceil(lockRem / 60),
    };
  }

  const record = await prisma.oTPRequest.findFirst({
    where: { phone: normalized },
    orderBy: { createdAt: "desc" },
  });

  if (!record) {
    await logOtpEvent(normalized, "verify_fail", _ip, "no_request");
    return { success: false, reason: "invalid" };
  }

  if (record.lockedUntil && record.lockedUntil > new Date()) {
    await logOtpEvent(normalized, "verify_fail", _ip, "locked");
    return {
      success: false,
      reason: "locked",
      lockMinutes: Math.ceil((record.lockedUntil.getTime() - Date.now()) / 60000),
    };
  }

  if (record.expiresAt < new Date()) {
    await logOtpEvent(normalized, "verify_fail", _ip, "expired");
    return { success: false, reason: "expired" };
  }

  const attempts = await incrementVerifyAttempts(normalized, lockTtlSec);
  if (attempts > maxAttempts) {
    const lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
    await prisma.oTPRequest.update({
      where: { id: record.id },
      data: { lockedUntil },
    });
    await setLock(normalized, lockTtlSec);
    await logOtpEvent(normalized, "verify_fail", _ip, "too_many_attempts");
    return {
      success: false,
      reason: "too_many_attempts",
      lockMinutes,
    };
  }

  const codeHash = hashOtp(trimmed);
  if (codeHash !== record.codeHash) {
    await logOtpEvent(normalized, "verify_fail", _ip, "invalid");
    return { success: false, reason: "invalid" };
  }

  await clearVerifyAttempts(normalized);

  const admin = await prisma.adminPhone.findUnique({
    where: { phone: normalized },
  });
  const role = admin ? "ADMIN" : "CUSTOMER";

  await logOtpEvent(normalized, "verify_success", _ip, "ok");
  return { success: true, phone: normalized, role };
}
