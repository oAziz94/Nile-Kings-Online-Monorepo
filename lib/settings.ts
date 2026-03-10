/**
 * Site settings (key-value). Used for senior promo enabled, etc.
 */

import { prisma } from "@/lib/db";

export const SITE_SETTING_KEYS = {
  SENIOR_PROMO_ENABLED: "senior_promo_enabled",
  COD_FEE_PIASTRES: "cod_fee_piastres",
  COD_FEE_PERCENT: "cod_fee_percent",
  OTP_EXPIRY_MINUTES: "otp_expiry_minutes",
  OTP_COOLDOWN_SECONDS: "otp_cooldown_seconds",
  OTP_MAX_VERIFY_ATTEMPTS: "otp_max_verify_attempts",
  OTP_LOCK_MINUTES: "otp_lock_minutes",
} as const;

export async function getSiteSetting(key: string): Promise<string | null> {
  try {
    const row = await prisma.siteSetting.findUnique({
      where: { key },
      select: { value: true },
    });
    return row?.value ?? null;
  } catch (e: unknown) {
    // P2021 = table does not exist (migration not run yet)
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2021") {
      return null;
    }
    throw e;
  }
}

export async function setSiteSetting(key: string, value: string): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

export async function isSeniorPromoEnabled(): Promise<boolean> {
  const v = await getSiteSetting(SITE_SETTING_KEYS.SENIOR_PROMO_ENABLED);
  return v === "true";
}

export async function setSeniorPromoEnabled(enabled: boolean): Promise<void> {
  await setSiteSetting(SITE_SETTING_KEYS.SENIOR_PROMO_ENABLED, enabled ? "true" : "false");
}

/** COD fee in piastres (admin-configurable, used when percent is 0). Default 0. */
export async function getCodFeePiastres(): Promise<number> {
  const v = await getSiteSetting(SITE_SETTING_KEYS.COD_FEE_PIASTRES);
  if (v == null || v === "") return 0;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function setCodFeePiastres(piastres: number): Promise<void> {
  const n = Math.max(0, Math.floor(piastres));
  await setSiteSetting(SITE_SETTING_KEYS.COD_FEE_PIASTRES, String(n));
}

/** COD fee as percentage of order (subtotal after discounts + shipping). If > 0, used instead of fixed piastres. Default 0. */
export async function getCodFeePercent(): Promise<number> {
  const v = await getSiteSetting(SITE_SETTING_KEYS.COD_FEE_PERCENT);
  if (v == null || v === "") return 0;
  const n = parseFloat(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
}

export async function setCodFeePercent(percent: number): Promise<void> {
  const n = Math.max(0, Math.min(100, percent));
  await setSiteSetting(SITE_SETTING_KEYS.COD_FEE_PERCENT, String(n));
}

export type OtpRules = {
  expiryMinutes: number;
  cooldownSeconds: number;
  maxVerifyAttempts: number;
  lockMinutes: number;
};

const DEFAULT_OTP_RULES: OtpRules = {
  expiryMinutes: 10,
  cooldownSeconds: 60,
  maxVerifyAttempts: 5,
  lockMinutes: 15,
};

export async function getOtpRules(): Promise<OtpRules> {
  const [expiry, cooldown, maxAttempts, lock] = await Promise.all([
    getSiteSetting(SITE_SETTING_KEYS.OTP_EXPIRY_MINUTES),
    getSiteSetting(SITE_SETTING_KEYS.OTP_COOLDOWN_SECONDS),
    getSiteSetting(SITE_SETTING_KEYS.OTP_MAX_VERIFY_ATTEMPTS),
    getSiteSetting(SITE_SETTING_KEYS.OTP_LOCK_MINUTES),
  ]);
  return {
    expiryMinutes: parsePositiveInt(expiry, DEFAULT_OTP_RULES.expiryMinutes, 60),
    cooldownSeconds: parsePositiveInt(cooldown, DEFAULT_OTP_RULES.cooldownSeconds, 300),
    maxVerifyAttempts: parsePositiveInt(maxAttempts, DEFAULT_OTP_RULES.maxVerifyAttempts, 10),
    lockMinutes: parsePositiveInt(lock, DEFAULT_OTP_RULES.lockMinutes, 60),
  };
}

function parsePositiveInt(
  value: string | null,
  defaultVal: number,
  max: number
): number {
  if (value == null || value === "") return defaultVal;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

export async function setOtpRules(rules: Partial<OtpRules>): Promise<OtpRules> {
  const current = await getOtpRules();
  const next = { ...current, ...rules };
  await Promise.all([
    setSiteSetting(SITE_SETTING_KEYS.OTP_EXPIRY_MINUTES, String(next.expiryMinutes)),
    setSiteSetting(SITE_SETTING_KEYS.OTP_COOLDOWN_SECONDS, String(next.cooldownSeconds)),
    setSiteSetting(SITE_SETTING_KEYS.OTP_MAX_VERIFY_ATTEMPTS, String(next.maxVerifyAttempts)),
    setSiteSetting(SITE_SETTING_KEYS.OTP_LOCK_MINUTES, String(next.lockMinutes)),
  ]);
  return next;
}
