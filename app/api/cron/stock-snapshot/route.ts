import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiError, apiSuccess } from "@/lib/api/response";
import { computePartnerStockTotals } from "@/lib/analytics/partner-stock-totals";
import { addDaysIsoUtc, cairoEndOfDayUtc, cairoYesterdayIso, dayIsoToDate } from "@/lib/analytics/cairo-day";

/** Backlog 7.5: rows older than this are pruned every run (~62-day "الشهر الماضي"
 * comparison plus a full year-over-year custom range headroom, at ~10 rows/day/partner). */
const SNAPSHOT_RETENTION_DAYS = 400;

/**
 * `GET /api/cron/stock-snapshot` (backlog 7.5) — scheduled daily in `vercel.json` at 22:05
 * UTC (00:05 Cairo; Egypt has been fixed at UTC+2 year-round since abolishing DST in 2016).
 * Upserts one `PartnerStockSnapshot` row per active partner for **yesterday** in
 * Africa/Cairo — idempotent on rerun via `@@unique([partnerId, day])` — then prunes rows
 * older than `SNAPSHOT_RETENTION_DAYS`. Guarded by `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return apiError("INTERNAL", "CRON_SECRET غير معرَّف في بيئة الخادم");
  }

  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${secret}`) {
    return apiError("UNAUTHORIZED", "غير مصرح");
  }

  const now = new Date();
  const dayIso = cairoYesterdayIso(now);
  const at = cairoEndOfDayUtc(dayIso);
  const day = dayIsoToDate(dayIso);

  const partners = await prisma.partner.findMany({ where: { isActive: true }, select: { id: true } });

  let written = 0;
  for (const partner of partners) {
    const totals = await computePartnerStockTotals(partner.id, at);
    await prisma.partnerStockSnapshot.upsert({
      where: { partnerId_day: { partnerId: partner.id, day } },
      create: {
        partnerId: partner.id,
        day,
        sellableUnits: totals.sellableUnits,
        reservedUnits: totals.reservedUnits,
        valuationPiastres: BigInt(totals.valuationCostPiastres),
        coverDays: totals.coverDays,
        deadStockSkus: totals.deadStockSkus,
        outOfStockSkus: totals.outOfStockSkus,
      },
      update: {
        sellableUnits: totals.sellableUnits,
        reservedUnits: totals.reservedUnits,
        valuationPiastres: BigInt(totals.valuationCostPiastres),
        coverDays: totals.coverDays,
        deadStockSkus: totals.deadStockSkus,
        outOfStockSkus: totals.outOfStockSkus,
      },
    });
    written += 1;
  }

  const cutoff = dayIsoToDate(addDaysIsoUtc(dayIso, -SNAPSHOT_RETENTION_DAYS));
  const pruneResult = await prisma.partnerStockSnapshot.deleteMany({ where: { day: { lt: cutoff } } });

  return apiSuccess({ day: dayIso, written, pruned: pruneResult.count });
}
