import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { resolveThreshold } from "@/lib/partner/resolve-threshold";
import { isOrderOverdue, type OverdueStatus } from "@/lib/partner/today";

/**
 * GET /api/partner/alerts (backlog 4.17, overdue rule updated 5.2) — a computed alert feed,
 * no notification table. Kinds: new orders assigned since `alertsSeenAt`, stock lines
 * at/below the partner's *resolved* threshold (`resolveThreshold()` — rule 13, product then
 * category then the partner default, not `Partner.lowStockThreshold` directly), restock
 * events since `alertsSeenAt` (role-specific), and orders in CONFIRMED/PROCESSING overdue
 * against the partner's own `confirmSlaHours`/`shipSlaHours` ("متأخر") — replaces the
 * previously hard-coded 24h, matching اليوم's queue rule exactly (`lib/partner/today.ts`'s
 * `isOrderOverdue`, computed from the latest `OrderAuditLog` status row). Each alert carries
 * an `occurredAt` used both for sorting and for the unseen count (`occurredAt >
 * alertsSeenAt`, or always unseen when `alertsSeenAt` is null) — a low-stock line stops
 * counting as "unseen" once the user opens the bell (`POST /api/partner/alerts/seen`), even
 * though the underlying condition persists, until it changes again and bumps its own
 * `updatedAt`.
 */

export type PartnerAlertKind = "new_order" | "low_stock" | "restock" | "overdue";

export type PartnerAlert = {
  id: string;
  kind: PartnerAlertKind;
  message: string;
  href: string;
  occurredAt: string;
};

export async function GET() {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({
      where: { id: user.partnerId },
      select: {
        id: true,
        partnerType: true,
        alertsSeenAt: true,
        alertPrefs: true,
        confirmSlaHours: true,
        shipSlaHours: true,
      },
    });
    if (!partner) return apiForbidden("غير مصرح");
    // Settings' alert toggles (keys = PartnerAlertKind); a missing key means "on".
    const prefs = (partner.alertPrefs ?? {}) as Partial<Record<PartnerAlertKind, boolean>>;
    const kindOn = (kind: PartnerAlertKind) => prefs[kind] !== false;

    const seenAt = partner.alertsSeenAt ?? new Date(0);
    const now = new Date();
    const sla = { confirmSlaHours: partner.confirmSlaHours, shipSlaHours: partner.shipSlaHours };

    const [newOrders, confirmedProcessingOrders, threshold, lowStockRows, restockRows] = await Promise.all([
      prisma.order.findMany({
        where: { assignedPartnerId: partner.id, createdAt: { gt: seenAt } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, status: true, createdAt: true },
      }),
      prisma.order.findMany({
        where: { assignedPartnerId: partner.id, status: { in: ["CONFIRMED", "PROCESSING"] } },
        select: { id: true, status: true, updatedAt: true },
      }),
      resolveThreshold(partner.id),
      prisma.partnerInventory.findMany({
        where: { partnerId: partner.id },
        orderBy: { updatedAt: "desc" },
        take: 100,
        select: {
          id: true,
          stockAvailable: true,
          stockReserved: true,
          updatedAt: true,
          variant: {
            select: {
              name: true,
              sku: true,
              product: { select: { id: true, name: true, categoryId: true } },
            },
          },
        },
      }),
      partner.partnerType === "AGENT"
        ? prisma.restockRequest.findMany({
            where: { sourcePartnerId: partner.id, createdAt: { gt: seenAt } },
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { id: true, createdAt: true, destinationPartner: { select: { name: true } } },
          })
        : prisma.restockRequest.findMany({
            where: { destinationPartnerId: partner.id, status: { not: "PENDING" }, updatedAt: { gt: seenAt } },
            orderBy: { updatedAt: "desc" },
            take: 20,
            select: { id: true, status: true, updatedAt: true },
          }),
    ]);

    const alerts: PartnerAlert[] = [];

    for (const order of newOrders) {
      alerts.push({
        id: `new_order:${order.id}`,
        kind: "new_order",
        message: `طلب جديد #${order.id.slice(-8)}`,
        href: `/partner/routed-orders?q=${order.id}`,
        occurredAt: order.createdAt.toISOString(),
      });
    }

    const confirmedProcessingIds = confirmedProcessingOrders.map((o) => o.id);
    const auditByOrderId =
      confirmedProcessingIds.length === 0
        ? new Map<string, Date>()
        : new Map(
            (
              await prisma.orderAuditLog.findMany({
                where: { orderId: { in: confirmedProcessingIds }, event: { in: ["status_change", "confirmed"] } },
                orderBy: { createdAt: "desc" },
                distinct: ["orderId"],
                select: { orderId: true, createdAt: true },
              })
            ).map((r) => [r.orderId, r.createdAt])
          );

    for (const order of confirmedProcessingOrders) {
      const latestStatusLogAt = auditByOrderId.get(order.id) ?? null;
      const overdue = isOrderOverdue(
        { status: order.status as OverdueStatus, updatedAt: order.updatedAt, latestStatusLogAt },
        sla,
        now
      );
      if (!overdue) continue;
      alerts.push({
        id: `overdue:${order.id}`,
        kind: "overdue",
        message: `طلب متأخر #${order.id.slice(-8)}`,
        href: `/partner/routed-orders?q=${order.id}`,
        occurredAt: (latestStatusLogAt ?? order.updatedAt).toISOString(),
      });
    }

    for (const row of lowStockRows) {
      const sellable = row.stockAvailable - row.stockReserved;
      const rowThreshold = threshold.forVariant({
        productId: row.variant.product.id,
        categoryId: row.variant.product.categoryId,
      });
      if (sellable > rowThreshold) continue;
      const label = `${row.variant.product.name} — ${row.variant.name}`;
      alerts.push({
        id: `low_stock:${row.id}`,
        kind: "low_stock",
        message: sellable <= 0 ? `نفد المخزون: ${label}` : `مخزون منخفض: ${label} (${sellable})`,
        href: "/partner/products?lowStock=1",
        occurredAt: row.updatedAt.toISOString(),
      });
    }

    if (partner.partnerType === "AGENT") {
      for (const row of restockRows as { id: string; createdAt: Date; destinationPartner: { name: string } }[]) {
        alerts.push({
          id: `restock:${row.id}`,
          kind: "restock",
          message: `طلب إعادة توريد جديد من ${row.destinationPartner.name}`,
          href: "/partner/distributor-requests",
          occurredAt: row.createdAt.toISOString(),
        });
      }
    } else {
      for (const row of restockRows as { id: string; status: string; updatedAt: Date }[]) {
        alerts.push({
          id: `restock:${row.id}`,
          kind: "restock",
          message: `تحديث على طلب إعادة التوريد #${row.id.slice(-8)}`,
          href: "/partner/restock-requests",
          occurredAt: row.updatedAt.toISOString(),
        });
      }
    }

    const enabledAlerts = alerts.filter((a) => kindOn(a.kind));
    alerts.length = 0;
    alerts.push(...enabledAlerts);
    alerts.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

    const unseenCount = alerts.filter(
      (a) => !partner.alertsSeenAt || new Date(a.occurredAt).getTime() > partner.alertsSeenAt.getTime()
    ).length;

    return apiSuccess({
      alerts,
      unseenCount,
      alertsSeenAt: partner.alertsSeenAt ? partner.alertsSeenAt.toISOString() : null,
    });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
