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

/** Network defaults a partner without an override inherits — schema defaults today; a
 * later task may move these into a stored settings table (`06-admin-v2.md` §3.7 "الشركاء").
 * Backlog 9.4a: "if there is no stored network default for SLA hours yet, use the schema
 * defaults 24/48 and say so" — done here, in one place both the profile settings tab and any
 * future settings screen can read. */
export const PARTNER_NETWORK_DEFAULTS = {
  confirmSlaHours: 24,
  shipSlaHours: 48,
  costRateBps: 7500,
} as const;
