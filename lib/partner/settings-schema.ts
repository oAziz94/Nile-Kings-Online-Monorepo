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
