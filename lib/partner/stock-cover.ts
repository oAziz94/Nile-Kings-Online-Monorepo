/**
 * Days-of-cover for the partner stock table (backlog 5.4, `05-partner-portal-v2.md` §4.4):
 * `coverDays = sellable ÷ velocityPerDay`, where `velocityPerDay` is units sold in the last
 * 30 days on orders assigned to this partner (`Order.assignedPartnerId`) that are not
 * CANCELLED, divided by 30. Capped display at "120+"; "—" when there is no sales velocity
 * (division by zero has no meaningful answer — a variant that never sold isn't "infinite
 * cover", it's simply unmeasured).
 *
 * A parallel task (5.6a, `lib/analytics/partner-reports.ts`) computes a very similar
 * velocity for the inventory report independently — the two are not shared on purpose (the
 * PM reconciles at merge per the task brief), so this module stays self-contained with no
 * import from `lib/analytics/*`.
 */
import { prisma } from "../db";

export const COVER_DAYS_WINDOW = 30;
export const COVER_DAYS_CAP = 120;

/** Pure — no Prisma — for direct unit testing. */
export function computeCoverDays(sellable: number, unitsSoldLast30Days: number): number | null {
  const velocityPerDay = unitsSoldLast30Days / COVER_DAYS_WINDOW;
  if (velocityPerDay <= 0) return null; // "—": no measurable velocity
  const days = sellable / velocityPerDay;
  return Math.min(COVER_DAYS_CAP, Math.round(days));
}

/** Formats the `computeCoverDays` result for display: "120+" at the cap, "—" for null. */
export function formatCoverDays(coverDays: number | null): string {
  if (coverDays === null) return "—";
  return coverDays >= COVER_DAYS_CAP ? "120+" : String(coverDays);
}

/**
 * Units sold per variant, over the last 30 days, on this partner's non-cancelled orders.
 * Returns a lookup keyed by `variantId`; a variant absent from the map sold zero units.
 */
export async function getVariantVelocities(
  partnerId: string,
  variantIds: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (variantIds.length === 0) return map;

  const since = new Date(Date.now() - COVER_DAYS_WINDOW * 24 * 60 * 60 * 1000);
  const rows = await prisma.orderItem.groupBy({
    by: ["variantId"],
    where: {
      variantId: { in: variantIds },
      order: {
        assignedPartnerId: partnerId,
        status: { not: "CANCELLED" },
        createdAt: { gte: since },
      },
    },
    _sum: { quantity: true },
  });
  for (const row of rows) {
    map.set(row.variantId, row._sum.quantity ?? 0);
  }
  return map;
}

/** Convenience: resolves cover days for a set of `{ variantId, sellable }` rows in one query. */
export async function resolveCoverDays(
  partnerId: string,
  rows: { variantId: string; sellable: number }[]
): Promise<Map<string, number | null>> {
  const velocities = await getVariantVelocities(
    partnerId,
    rows.map((r) => r.variantId)
  );
  const result = new Map<string, number | null>();
  for (const row of rows) {
    result.set(row.variantId, computeCoverDays(row.sellable, velocities.get(row.variantId) ?? 0));
  }
  return result;
}
