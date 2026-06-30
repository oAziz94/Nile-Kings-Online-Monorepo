/**
 * Forgot password: request OTP (block admin numbers), verify OTP, issue reset token, set new password.
 */

import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";
import { normalizePhone, requestOtp, verifyOtpForForgotPassword } from "@/lib/auth/otp";
import { hashPassword } from "@/lib/auth/password";

const RESET_TOKEN_ISSUER = "nile-kings";
const RESET_TOKEN_AUDIENCE = "nile-kings-password-reset";
const RESET_TOKEN_EXPIRY_SEC = 15 * 60; // 15 minutes

async function getSecret(): Promise<Uint8Array> {
  return new TextEncoder().encode(env.JWT_SECRET);
}

/** Create a short-lived JWT for password reset. Call after OTP verified. */
export async function createResetToken(phone: string): Promise<string> {
  const secret = await getSecret();
  return new SignJWT({ phone, purpose: "password_reset" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(RESET_TOKEN_ISSUER)
    .setAudience(RESET_TOKEN_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + RESET_TOKEN_EXPIRY_SEC)
    .sign(secret);
}

/** Verify reset token; returns phone or null. */
export async function verifyResetToken(token: string): Promise<string | null> {
  try {
    const secret = await getSecret();
    const { payload } = await jwtVerify(token, secret, {
      issuer: RESET_TOKEN_ISSUER,
      audience: RESET_TOKEN_AUDIENCE,
    });
    const phone = payload.phone;
    if (typeof phone !== "string" || payload.purpose !== "password_reset") return null;
    return phone;
  } catch {
    return null;
  }
}

export type RequestPasswordResetResult =
  | { success: true; cooldownSeconds?: number }
  | { success: false; reason: "admin_phone" }
  | { success: false; reason: "invalid_phone" }
  | { success: false; reason: "no_account" }
  | { success: false; reason: "cooldown"; cooldownSeconds: number }
  | { success: false; reason: "rate_limit_phone" }
  | { success: false; reason: "rate_limit_ip" }
  | { success: false; reason: "locked"; lockMinutes: number }
  | { success: false; reason: "twilio_error"; message: string };

/** Request OTP for forgot password. Blocks users with role ADMIN; requires existing user with password. */
export async function requestPasswordResetOtp(
  phone: string,
  ip: string | null
): Promise<RequestPasswordResetResult> {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return { success: false, reason: "invalid_phone" };
  }

  const user = await prisma.user.findUnique({
    where: { phone: normalized },
    select: { id: true, passwordHash: true, role: true },
  });
  if (user?.role === "ADMIN") {
    return { success: false, reason: "admin_phone" };
  }
  if (!user || !user.passwordHash) {
    return { success: false, reason: "no_account" };
  }

  const result = await requestOtp(phone, ip, "forgot_password");
  if (result.success) {
    return { success: true, cooldownSeconds: result.cooldownSeconds };
  }
  return result as RequestPasswordResetResult;
}

/** Verify OTP for forgot password and return reset token. */
export async function verifyPasswordResetOtp(
  phone: string,
  code: string,
  ip: string | null
) {
  return verifyOtpForForgotPassword(phone, code, ip, createResetToken);
}

/** Set new password using a valid reset token. */
export async function resetPasswordWithToken(
  token: string,
  newPassword: string
): Promise<{ success: true } | { success: false; reason: "invalid_token" | "no_user" }> {
  const phone = await verifyResetToken(token);
  if (!phone) return { success: false, reason: "invalid_token" };

  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true },
  });
  if (!user) return { success: false, reason: "no_user" };

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });
  return { success: true };
}
