/**
 * Sales-velocity sources (backlog 11.5). The inventory report's formulas (cover days, dead
 * stock, reorder suggestion) only need two facts per variant: units sold over a period and the
 * date of the last sale. Where those facts come from depends on the channel:
 *  - an AGENT sells online, so the source is the partner's non-CANCELLED `Order` lines
 *    (`orderVelocitySource`, byte-for-byte the pre-11.5 queries);
 *  - an outlet (DISTRIBUTOR) sells at its counter, so the source is the COMPLETED `StoreSale`
 *    lines (`storeVelocitySource`; a VOIDED sale never counts, its stock went back).
 * Callers pick a source with `velocitySourceFor(partnerType)` and pass it down; the formulas
 * themselves never know which channel they are looking at.
 */
import { prisma } from "@/lib/db";
import { addDaysIsoUtc, cairoStartOfDayUtc } from "./cairo-day";
import { daySpanInclusive, getSkuVelocityForPeriod, type ReportPeriodRange, type SkuVelocity } from "./partner-reports";

export type VelocitySource = {
  kind: "orders" | "store";
  /** Units sold per variant over the inclusive ISO-day range, with units/day. */
  velocityForPeriod(partnerId: string, range: ReportPeriodRange): Promise<Map<string, SkuVelocity>>;
  /** The most recent sale instant per variant, ever. */
  lastSaleByVariant(partnerId: string): Promise<Map<string, Date>>;
};

export const orderVelocitySource: VelocitySource = {
  kind: "orders",
  velocityForPeriod: getSkuVelocityForPeriod,
  async lastSaleByVariant(partnerId) {
    const items = await prisma.orderItem.findMany({
      where: { order: { assignedPartnerId: partnerId, status: { not: "CANCELLED" } } },
      select: { variantId: true, order: { select: { createdAt: true } } },
    });
    const map = new Map<string, Date>();
    for (const item of items) {
      const existing = map.get(item.variantId);
      if (!existing || item.order.createdAt > existing) map.set(item.variantId, item.order.createdAt);
    }
    return map;
  },
};

/** Cairo-day bounds of an inclusive ISO range: `[from 00:00, day-after-to 00:00)`. */
export function cairoRangeBounds(range: ReportPeriodRange): { gte: Date; lt: Date } {
  return { gte: cairoStartOfDayUtc(range.from), lt: cairoStartOfDayUtc(addDaysIsoUtc(range.to, 1)) };
}

export const storeVelocitySource: VelocitySource = {
  kind: "store",
  async velocityForPeriod(partnerId, range) {
    const days = daySpanInclusive(range.from, range.to);
    const groups = await prisma.storeSaleItem.groupBy({
      by: ["variantId"],
      where: { sale: { partnerId, status: "COMPLETED", soldAt: cairoRangeBounds(range) } },
      _sum: { quantity: true },
    });
    const map = new Map<string, SkuVelocity>();
    for (const g of groups) {
      const unitsSold = g._sum.quantity ?? 0;
      map.set(g.variantId, { variantId: g.variantId, unitsSold, velocityPerDay: unitsSold / days });
    }
    return map;
  },
  async lastSaleByVariant(partnerId) {
    const items = await prisma.storeSaleItem.findMany({
      where: { sale: { partnerId, status: "COMPLETED" } },
      select: { variantId: true, sale: { select: { soldAt: true } } },
    });
    const map = new Map<string, Date>();
    for (const item of items) {
      const existing = map.get(item.variantId);
      if (!existing || item.sale.soldAt > existing) map.set(item.variantId, item.sale.soldAt);
    }
    return map;
  },
};

export function velocitySourceFor(partnerType: string | null | undefined): VelocitySource {
  return partnerType === "DISTRIBUTOR" ? storeVelocitySource : orderVelocitySource;
}
