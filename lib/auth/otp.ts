/**
 * OTP: 6-digit numeric, expiry/cooldown/lock from admin settings (getOtpRules).
 * Store hash (sha256+salt) in DB. Never return OTP.
 */

import crypto from "node:crypto";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { getOtpRules } from "@/lib/settings";
import { getWhatsAppService } from "@/lib/services/whatsapp";
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
import { normalizeAccountPhone } from "@/lib/phone";

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

/**
 * Normalize the account-identity phone (forgot-password's OTP lookup/send target) to E.164.
 * Uses `normalizeAccountPhone` (all 22 dropdown countries) rather than Egypt-only, per
 * docs/redesign/04-decisions.md 2026-09-10 "International account phone numbers" — mirrors
 * login/register's own account-phone validation. Only `purpose: "forgot_password"` actually
 * has any live callers today (the `purpose: "login"` OTP path is dead code, confirmed zero
 * callers repo-wide), but this function is shared by both, so both get the same behavior.
 */
export function normalizePhone(phone: string): string {
  return normalizeAccountPhone(phone) ?? "";
}

export type RequestOtpResult =
  | { success: true; cooldownSeconds?: number }
  | { success: false; reason: "cooldown"; cooldownSeconds: number }
  | { success: false; reason: "rate_limit_phone" }
  | { success: false; reason: "rate_limit_ip" }
  | { success: false; reason: "locked"; lockMinutes: number }
  | { success: false; reason: "invalid_phone" }
  | { success: false; reason: "send_error"; message: string };

/**
 * "login" is legacy dead code — the OTP-for-login routes were deleted in backlog 4.2, and
 * `verifyOtp` below (the function that reads it) has zero remaining callers. Kept only so the
 * `OTPRequest.purpose` column's historical rows still typecheck; do not wire a new caller to it.
 * "register" is new for backlog 4.4 (WhatsApp OTP via WaPilot) — a distinct purpose (not reused
 * "login") so `OTPRequest` rows stay unambiguous between the two verified-phone flows.
 */
export type OtpPurpose = "login" | "forgot_password" | "register";

/** Request OTP: rate limits, cooldown, lock check; send via WhatsApp (WaPilot); store hash in DB; set cooldown. */
export async function requestOtp(
  phone: string,
  ip: string | null,
  purpose: OtpPurpose = "login"
): Promise<RequestOtpResult> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { success: false, reason: "invalid_phone" };
  }
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
  const body =
    purpose === "forgot_password"
      ? `رمز استعادة كلمة المرور نايل كينجز: ${code}`
      : `رمز التحقق نايل كينجز: ${code}`;

  const sendResult = await getWhatsAppService().sendText(normalized, body);
  if (!sendResult.ok) {
    await logOtpEvent(normalized, "request", ip, `send_error: ${sendResult.error}`);
    return { success: false, reason: "send_error", message: sendResult.error };
  }

  await clearVerifyAttempts(normalized); // new OTP = reset verify attempts
  await prisma.oTPRequest.create({
    data: {
      phone: normalized,
      codeHash,
      expiresAt,
      attempts: 0,
      purpose,
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
  if (!normalized) {
    return { success: false, reason: "invalid" };
  }
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
    where: {
      phone: normalized,
      OR: [{ purpose: null }, { purpose: "login" }],
    },
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

  let user = await prisma.user.findUnique({
    where: { phone: normalized },
  });
  if (!user) {
    user = await prisma.user.create({
      data: {
        phone: normalized,
        role: "CUSTOMER",
      },
    });
  }

  await logOtpEvent(normalized, "verify_success", _ip, "ok");
  return {
    success: true,
    userId: user.id,
    role: user.role as "CUSTOMER" | "ADMIN",
  };
}

export type VerifyOtpForForgotPasswordResult =
  | { success: true; resetToken: string }
  | { success: false; reason: "locked"; lockMinutes: number }
  | { success: false; reason: "invalid" }
  | { success: false; reason: "expired" }
  | { success: false; reason: "too_many_attempts"; lockMinutes: number };

/** Verify OTP for forgot-password flow only (purpose = forgot_password). Returns reset token on success. */
export async function verifyOtpForForgotPassword(
  phone: string,
  code: string,
  _ip: string | null,
  createResetToken: (phone: string) => Promise<string>
): Promise<VerifyOtpForForgotPasswordResult> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { success: false, reason: "invalid" };
  }
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
    where: { phone: normalized, purpose: "forgot_password" },
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
  const resetToken = await createResetToken(normalized);
  await logOtpEvent(normalized, "verify_success", _ip, "forgot_password_ok");
  return { success: true, resetToken };
}

export type VerifyOtpForRegisterResult =
  | { success: true; registerToken: string }
  | { success: false; reason: "locked"; lockMinutes: number }
  | { success: false; reason: "invalid" }
  | { success: false; reason: "expired" }
  | { success: false; reason: "too_many_attempts"; lockMinutes: number };

/**
 * Verify OTP for the registration flow only (purpose = "register"). Structurally identical to
 * `verifyOtpForForgotPassword` above (same lock/attempts/expiry/hash-compare sequence — kept as
 * a separate, near-duplicate function rather than a shared refactor, matching this file's
 * existing precedent of `verifyOtp`/`verifyOtpForForgotPassword` coexisting as near-duplicates;
 * this task's scope is the transport (WhatsApp) and the new register flow, not a refactor of
 * otp.ts's existing logic). Returns a short-lived register token on success (not a User — unlike
 * the old dead `verifyOtp`, this doesn't create the account yet, since name/email/password
 * haven't been collected; see lib/auth/register-otp.ts for the token + account-creation gate).
 */
export async function verifyOtpForRegister(
  phone: string,
  code: string,
  _ip: string | null,
  createRegisterToken: (phone: string) => Promise<string>
): Promise<VerifyOtpForRegisterResult> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { success: false, reason: "invalid" };
  }
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
    where: { phone: normalized, purpose: "register" },
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
  const registerToken = await createRegisterToken(normalized);
  await logOtpEvent(normalized, "verify_success", _ip, "register_ok");
  return { success: true, registerToken };
}
