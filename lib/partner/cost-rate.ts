/**
 * Partner factory-settlement rate (backlog 5.1, `05-partner-portal-v2.md` §1 "Settlement
 * model"): the partner buys stock from the factory at `costRateBps` basis points of the
 * selling price (7500 = 75%). Admin-write only — rule (18): "a partner API that accepts
 * it is a defect". `SiteSetting partner_default_cost_rate_bps` seeds the default for new
 * partners created without an explicit rate (the column's own `@default(7500)` covers the
 * case where the site setting row doesn't exist yet).
 */
import { prisma } from "@/lib/db";

export const DEFAULT_COST_RATE_BPS = 7500;
export const SITE_SETTING_KEY_DEFAULT_COST_RATE_BPS = "partner_default_cost_rate_bps";

export async function getPartnerCostRate(partnerId: string): Promise<number> {
  const partner = await prisma.partner.findUniqueOrThrow({
    where: { id: partnerId },
    select: { costRateBps: true },
  });
  return partner.costRateBps;
}

/** Reads the site-wide default rate (used when seeding a new partner), falling back to 7500. */
export async function getDefaultCostRateBps(): Promise<number> {
  const row = await prisma.siteSetting.findUnique({
    where: { key: SITE_SETTING_KEY_DEFAULT_COST_RATE_BPS },
    select: { value: true },
  });
  if (!row) return DEFAULT_COST_RATE_BPS;
  const parsed = Number(row.value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : DEFAULT_COST_RATE_BPS;
}
