import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getOtpRules, setOtpRules, type OtpRules } from "@/lib/settings";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";

export async function GET() {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const rules = await getOtpRules();
  return apiSuccess(rules);
}

const otpRulesSchema = {
  expiryMinutes: (v: unknown) => typeof v === "number" && v >= 1 && v <= 60,
  cooldownSeconds: (v: unknown) => typeof v === "number" && v >= 0 && v <= 300,
  maxVerifyAttempts: (v: unknown) => typeof v === "number" && v >= 1 && v <= 10,
  lockMinutes: (v: unknown) => typeof v === "number" && v >= 1 && v <= 60,
};

export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  let body: Partial<OtpRules>;
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const updates: Partial<OtpRules> = {};
  if (body.expiryMinutes !== undefined) {
    if (!otpRulesSchema.expiryMinutes(body.expiryMinutes))
      return apiBadRequest("expiryMinutes يجب أن يكون بين 1 و 60");
    updates.expiryMinutes = body.expiryMinutes;
  }
  if (body.cooldownSeconds !== undefined) {
    if (!otpRulesSchema.cooldownSeconds(body.cooldownSeconds))
      return apiBadRequest("cooldownSeconds يجب أن يكون بين 0 و 300");
    updates.cooldownSeconds = body.cooldownSeconds;
  }
  if (body.maxVerifyAttempts !== undefined) {
    if (!otpRulesSchema.maxVerifyAttempts(body.maxVerifyAttempts))
      return apiBadRequest("maxVerifyAttempts يجب أن يكون بين 1 و 10");
    updates.maxVerifyAttempts = body.maxVerifyAttempts;
  }
  if (body.lockMinutes !== undefined) {
    if (!otpRulesSchema.lockMinutes(body.lockMinutes))
      return apiBadRequest("lockMinutes يجب أن يكون بين 1 و 60");
    updates.lockMinutes = body.lockMinutes;
  }
  const rules = await setOtpRules(updates);
  return apiSuccess(rules);
}
