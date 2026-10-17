/**
 * Shared Zod bounds for every partner "knob" (backlog 9.4a (c), `06-admin-v2.md` §8 control
 * matrix). Both `PATCH /api/partner/settings` (the partner-owned subset) and
 * `PATCH /api/admin/partners/[id]` (the full set, admin-owned + partner-owned) import these
 * — the task text is explicit: "the same Zod bounds the partner route uses (import them, do
 * not retype)". Keeping the bounds here, once, is what makes that possible.
 */
import { z } from "zod";

export const WORKING_DAY_CODES = ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"] as const;
export const HANDOVER_METHODS = ["COURIER", "PICKUP", "OWN_DELIVERY"] as const;

export const lowStockThresholdSchema = z.number().int().min(0).max(999);
export const workingDaysSchema = z.array(z.enum(WORKING_DAY_CODES));
export const dailyOrderCapacitySchema = z.number().int().min(0).max(100_000).nullable();
export const confirmSlaHoursSchema = z.number().int().min(1).max(24 * 30);
export const shipSlaHoursSchema = z.number().int().min(1).max(24 * 30);
export const handoverMethodSchema = z.enum(HANDOVER_METHODS);
export const deadStockDaysSchema = z.number().int().min(1).max(3650);
export const targetCoverDaysSchema = z.number().int().min(1).max(3650);
/** `Partner.costRateBps` — basis points, 0..10000 (0%..100%). Same bound the admin partner
 * route already enforced before this task; centralised here so the settings tab can share it. */
export const costRateBpsSchema = z.number().int().min(0).max(10_000);

/** Network defaults a partner without an override inherits — the fallback `getPartnerNetworkDefaults()`
 * (`lib/settings.ts`) returns when no `SiteSetting` row named `partnerDefaults` exists yet
 * (backlog 9.7 (a); superseded the "schema defaults only" note from 9.4a). Values match the
 * `Partner` model's own `@default`s so a brand-new install with no settings row behaves exactly
 * as before. Both the profile settings tab ("الافتراضي N") and `/admin/settings`'s الشركاء
 * group read through `getPartnerNetworkDefaults()`, never this constant directly, except as
 * its documented fallback. */
export const PARTNER_NETWORK_DEFAULTS = {
  confirmSlaHours: 24,
  shipSlaHours: 48,
  costRateBps: 7500,
  lowStockThreshold: 5,
  deadStockDays: 60,
  targetCoverDays: 21,
} as const;

export const partnerNetworkDefaultsSchema = z.object({
  confirmSlaHours: confirmSlaHoursSchema,
  shipSlaHours: shipSlaHoursSchema,
  costRateBps: costRateBpsSchema,
  lowStockThreshold: lowStockThresholdSchema,
  deadStockDays: deadStockDaysSchema,
  targetCoverDays: targetCoverDaysSchema,
});

export type PartnerNetworkDefaults = z.infer<typeof partnerNetworkDefaultsSchema>;

/** Outlet (DISTRIBUTOR) store profile, backlog 11.2 (plan `12-distributor-store-plan.md` §3).
 * An empty string clears the field (stored as null); the receipt footer then falls back to
 * `DEFAULT_RECEIPT_FOOTER`. Accepted by `PATCH /api/partner/settings` from a DISTRIBUTOR only. */
export const DEFAULT_RECEIPT_FOOTER = "شكراً لتسوقكم من ملوك النيل";

const optionalStoreText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} يجب ألا يزيد عن ${max} حرفًا`)
    .transform((v) => (v === "" ? null : v));

export const storeNameSchema = optionalStoreText(80, "اسم المنفذ");
export const storeAddressSchema = optionalStoreText(200, "العنوان");
export const receiptFooterSchema = optionalStoreText(200, "نص أسفل الإيصال");

export const OUTLET_ONLY_SETTINGS_FIELDS = ["storeName", "storeAddress", "receiptFooter"] as const;
/**
 * Per-type gate for a settings PATCH body: returns an Arabic error message, or null when the
 * body's keys are allowed for `partnerType`.
 */
export function validateSettingsFieldsForType(partnerType: "AGENT" | "DISTRIBUTOR", body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const keys = Object.keys(body as Record<string, unknown>);
  if (partnerType === "AGENT" && keys.some((k) => (OUTLET_ONLY_SETTINGS_FIELDS as readonly string[]).includes(k))) {
    return "بيانات المنفذ متاحة للمنافذ فقط";
  }
  return null;
}
