import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { resolveThreshold } from "@/lib/partner/resolve-threshold";
import { isWorkingDay } from "@/lib/partner/working-day";
import {
  buildCapacityMeter,
  buildTrendSeries,
  isOrderOverdue,
  resolveWeekRanges,
  type OverdueStatus,
} from "@/lib/partner/today";
import { getKpis, getRevenueOverTime } from "@/lib/analytics/queries";
import { isKidsCategory, getDisplaySizeLabel } from "@/lib/size-display";

/**
 * GET /api/partner/today (backlog 5.2, `05-partner-portal-v2.md` §4.2) — everything the
 * اليوم screen renders: KPIs, the capacity meter, the six-group action queue, and the
 * 30-day trend. Every number is a real query — read-only, `requirePartner()`-gated,
 * scoped to `assignedPartnerId`/`partnerId` throughout.
 */

const TREND_DAYS = 30;
const ROWS_PER_GROUP = 3;

/** Latest `status_change`/`confirmed` audit row per order id (Map is empty for ids with
 * none — callers fall back to `updatedAt`, per rule (6) of `today.ts`). Plain Prisma
 * (`distinct` + `orderBy`), no raw SQL/array binding. */
async function latestStatusAuditAtByOrderId(orderIds: string[]): Promise<Map<string, Date>> {
  if (orderIds.length === 0) return new Map();
  const rows = await prisma.orderAuditLog.findMany({
    where: { orderId: { in: orderIds }, event: { in: ["status_change", "confirmed"] } },
    orderBy: { createdAt: "desc" },
    distinct: ["orderId"],
    select: { orderId: true, createdAt: true },
  });
  return new Map(rows.map((r) => [r.orderId, r.createdAt]));
}

/** Count of distinct orders assigned to `partnerId` that entered one of `statuses` today
 * (drives the capacity meter's "used" count). `OrderAuditLog` carries no partner column, so
 * this resolves today's matching order ids first, then counts which belong to the partner. */
async function countEnteredStatusSince(partnerId: string, statuses: string[], since: Date): Promise<number> {
  const auditRows = await prisma.orderAuditLog.findMany({
    where: { statusTo: { in: statuses }, event: { in: ["status_change", "confirmed"] }, createdAt: { gte: since } },
    select: { orderId: true },
    distinct: ["orderId"],
  });
  if (auditRows.length === 0) return 0;
  return prisma.order.count({
    where: { id: { in: auditRows.map((r) => r.orderId) }, assignedPartnerId: partnerId },
  });
}

type OrderRow = {
  id: string;
  status: string;
  totalPiastres: number;
  updatedAt: Date;
  createdAt: Date;
  shippingAddress: unknown;
  user: { name: string | null; phone: string };
};

function addressLine(shippingAddress: unknown): string {
  const a = (shippingAddress ?? {}) as { governorate?: string; city?: string | null; area?: string | null };
  return [a.city || a.area, a.governorate].filter(Boolean).join(" · ");
}

function mapOrderRow(o: OrderRow, enteredAt: Date) {
  return {
    id: o.id,
    customerName: o.user.name?.trim() || o.user.phone,
    addressLine: addressLine(o.shippingAddress),
    totalPiastres: o.totalPiastres,
    enteredAt: enteredAt.toISOString(),
    status: o.status,
  };
}

function group<T>(rows: T[]) {
  return {
    count: rows.length,
    rows: rows.slice(0, ROWS_PER_GROUP),
    moreCount: Math.max(0, rows.length - ROWS_PER_GROUP),
  };
}

export async function GET() {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({
      where: { id: user.partnerId },
      select: {
        id: true,
        partnerType: true,
        name: true,
        workingDays: true,
        dailyOrderCapacity: true,
        confirmSlaHours: true,
        shipSlaHours: true,
      },
    });
    if (!partner) return apiForbidden("غير مصرح");

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const { thisWeek, lastWeek } = resolveWeekRanges(now);

    // Trend is fetched separately from everything else (its own try/catch below) so a
    // failure computing it never blanks the queue/KPIs — "a failed trend never blanks the
    // queue" (backlog 5.2's e2e note).
    let trendBuckets: Awaited<ReturnType<typeof getRevenueOverTime>> = [];
    let previousTrendBuckets: Awaited<ReturnType<typeof getRevenueOverTime>> = [];
    let trendError = false;
    try {
      [trendBuckets, previousTrendBuckets] = await Promise.all([
        getRevenueOverTime(
          "day",
          new Date(startOfToday.getTime() - (TREND_DAYS - 1) * 86_400_000).toISOString(),
          now.toISOString(),
          { partnerId: partner.id }
        ),
        // The prior 30-day window — drives the trend card's muted comparison line and its
        // "مقارنة بالفترة السابقة" delta.
        getRevenueOverTime(
          "day",
          new Date(startOfToday.getTime() - (2 * TREND_DAYS - 1) * 86_400_000).toISOString(),
          new Date(startOfToday.getTime() - TREND_DAYS * 86_400_000).toISOString(),
          { partnerId: partner.id }
        ),
      ]);
    } catch {
      trendError = true;
    }

    const [
      ordersToday,
      ordersYesterday,
      thisWeekKpis,
      lastWeekKpis,
      threshold,
      inventoryRows,
      createdOrders,
      confirmedProcessingOrders,
      readyToShipOrders,
      restockRows,
      capacityUsed,
    ] = await Promise.all([
      prisma.order.count({
        where: { assignedPartnerId: partner.id, createdAt: { gte: startOfToday } },
      }),
      prisma.order.count({
        where: { assignedPartnerId: partner.id, createdAt: { gte: startOfYesterday, lt: startOfToday } },
      }),
      getKpis(thisWeek.start.toISOString(), thisWeek.end.toISOString(), { partnerId: partner.id }),
      getKpis(lastWeek.start.toISOString(), lastWeek.end.toISOString(), { partnerId: partner.id }),
      resolveThreshold(partner.id),
      prisma.partnerInventory.findMany({
        where: { partnerId: partner.id },
        select: {
          id: true,
          stockAvailable: true,
          stockReserved: true,
          variant: {
            select: {
              id: true,
              name: true,
              colorName: true,
              product: { select: { id: true, name: true, categoryId: true, category: { select: { slug: true } } } },
            },
          },
        },
      }),
      prisma.order.findMany({
        where: { assignedPartnerId: partner.id, status: "CREATED" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          status: true,
          totalPiastres: true,
          updatedAt: true,
          createdAt: true,
          shippingAddress: true,
          user: { select: { name: true, phone: true } },
        },
      }),
      prisma.order.findMany({
        where: { assignedPartnerId: partner.id, status: { in: ["CONFIRMED", "PROCESSING"] } },
        orderBy: { updatedAt: "asc" },
        select: {
          id: true,
          status: true,
          totalPiastres: true,
          updatedAt: true,
          createdAt: true,
          shippingAddress: true,
          user: { select: { name: true, phone: true } },
        },
      }),
      prisma.order.findMany({
        where: { assignedPartnerId: partner.id, status: "READY_TO_SHIP" },
        orderBy: { updatedAt: "asc" },
        select: {
          id: true,
          status: true,
          totalPiastres: true,
          updatedAt: true,
          createdAt: true,
          shippingAddress: true,
          user: { select: { name: true, phone: true } },
        },
      }),
      partner.partnerType === "AGENT"
        ? prisma.restockRequest.findMany({
            where: { sourcePartnerId: partner.id, status: "PENDING" },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              createdAt: true,
              destinationPartner: { select: { name: true } },
              items: { select: { id: true } },
            },
          })
        : prisma.restockRequest.findMany({
            where: { destinationPartnerId: partner.id, status: { not: "PENDING" } },
            orderBy: { updatedAt: "desc" },
            take: 20,
            select: {
              id: true,
              status: true,
              updatedAt: true,
              sourcePartner: { select: { name: true } },
              items: { select: { id: true } },
            },
          }),
      countEnteredStatusSince(partner.id, ["CONFIRMED", "PROCESSING"], startOfToday),
    ]);

    // Latest status-audit timestamp for every CONFIRMED/PROCESSING/READY_TO_SHIP order,
    // in one query, so the overdue rule and the group's "since" timestamps agree.
    const orderIdsNeedingAudit = [
      ...confirmedProcessingOrders.map((o) => o.id),
      ...readyToShipOrders.map((o) => o.id),
    ];
    const auditByOrderId = await latestStatusAuditAtByOrderId(orderIdsNeedingAudit);

    const sla = { confirmSlaHours: partner.confirmSlaHours, shipSlaHours: partner.shipSlaHours };

    const overdueOrders: { row: OrderRow; enteredAt: Date }[] = [];
    const confirmedOrders: { row: OrderRow; enteredAt: Date }[] = [];
    for (const o of confirmedProcessingOrders) {
      const enteredAt = auditByOrderId.get(o.id) ?? o.updatedAt;
      const overdue = isOrderOverdue(
        { status: o.status as OverdueStatus, updatedAt: o.updatedAt, latestStatusLogAt: auditByOrderId.get(o.id) ?? null },
        sla,
        now
      );
      if (overdue) overdueOrders.push({ row: o, enteredAt });
      else if (o.status === "CONFIRMED") confirmedOrders.push({ row: o, enteredAt });
    }
    // Most overdue (oldest) first.
    overdueOrders.sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());

    let lowStockCount = 0;
    let sellableUnits = 0;
    const lowStockLines: {
      variantId: string;
      productName: string;
      variantName: string;
      sellable: number;
      threshold: number;
    }[] = [];
    for (const row of inventoryRows) {
      const sellable = row.stockAvailable - row.stockReserved;
      sellableUnits += sellable;
      const rowThreshold = threshold.forVariant({
        productId: row.variant.product.id,
        categoryId: row.variant.product.categoryId,
      });
      if (sellable <= rowThreshold) {
        lowStockCount += 1;
        const forKids = isKidsCategory(row.variant.product.category.slug);
        const sizeLabel = getDisplaySizeLabel(row.variant.name, forKids);
        lowStockLines.push({
          variantId: row.variant.id,
          productName: row.variant.product.name,
          variantName: [sizeLabel, row.variant.colorName].filter(Boolean).join(" · "),
          sellable,
          threshold: rowThreshold,
        });
      }
    }
    lowStockLines.sort((a, b) => a.sellable - b.sellable);

    const restock =
      partner.partnerType === "AGENT"
        ? (restockRows as { id: string; createdAt: Date; destinationPartner: { name: string }; items: { id: string }[] }[]).map(
            (r) => ({
              id: r.id,
              counterpartyName: r.destinationPartner.name,
              itemCount: r.items.length,
              occurredAt: r.createdAt.toISOString(),
            })
          )
        : (restockRows as { id: string; status: string; updatedAt: Date; sourcePartner: { name: string }; items: { id: string }[] }[]).map(
            (r) => ({
              id: r.id,
              counterpartyName: r.sourcePartner.name,
              itemCount: r.items.length,
              occurredAt: r.updatedAt.toISOString(),
            })
          );

    const trend = buildTrendSeries(trendBuckets, TREND_DAYS, now);
    const previousPeriodEnd = new Date(startOfToday.getTime() - TREND_DAYS * 86_400_000);
    const previousTrend = buildTrendSeries(previousTrendBuckets, TREND_DAYS, previousPeriodEnd);

    const trendTotal = trend.reduce((sum, p) => sum + p.revenuePiastres, 0);
    const previousTrendTotal = previousTrend.reduce((sum, p) => sum + p.revenuePiastres, 0);
    const trendDeltaPercent =
      previousTrendTotal === 0 ? null : Math.round(((trendTotal - previousTrendTotal) / previousTrendTotal) * 100);

    return apiSuccess({
      partnerType: partner.partnerType,
      partnerName: partner.name,
      workingDay: isWorkingDay(partner, now),
      capacity: buildCapacityMeter(partner.dailyOrderCapacity, capacityUsed),
      kpis: {
        ordersToday,
        ordersYesterday,
        revenueThisWeekPiastres: thisWeekKpis.netMerchandisePiastres,
        revenueLastWeekPiastres: lastWeekKpis.netMerchandisePiastres,
        sellableUnits,
        underThresholdCount: lowStockCount,
        overdueCount: overdueOrders.length,
      },
      queue: {
        toConfirm: group(createdOrders.map((o) => mapOrderRow(o, o.createdAt))),
        overdue: group(overdueOrders.map(({ row, enteredAt }) => mapOrderRow(row, enteredAt))),
        readyToShip: group(
          readyToShipOrders.map((o) => mapOrderRow(o, auditByOrderId.get(o.id) ?? o.updatedAt))
        ),
        confirmed: group(confirmedOrders.map(({ row, enteredAt }) => mapOrderRow(row, enteredAt))),
        restock: group(restock),
        lowStock: group(lowStockLines),
      },
      trend,
      previousTrend,
      trendDeltaPercent,
      trendError,
    });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
