import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";

/**
 * GET /api/partner/dashboard (backlog 4.17) — real Prisma aggregates for the `/partner`
 * home screen, scoped to `partnerId` via `requirePartner()`. Read-only. Every count here
 * is a live query, never a placeholder (per the Partner-portal intro: "the canvas's stat
 * numbers are placeholders; every number on a partner screen must come from a real query").
 */

const ASSIGNED_STATUSES = ["CREATED", "CONFIRMED", "PROCESSING", "READY_TO_SHIP"] as const;

export async function GET() {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({
      where: { id: user.partnerId },
      select: { id: true, partnerType: true, lowStockThreshold: true },
    });
    if (!partner) return apiForbidden("غير مصرح");

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [statusCounts, shippedToday, inventoryRows, activeDistributorCount] = await Promise.all([
      prisma.order.groupBy({
        by: ["status"],
        where: { assignedPartnerId: partner.id, status: { in: [...ASSIGNED_STATUSES] } },
        _count: { _all: true },
      }),
      prisma.order.count({
        where: { assignedPartnerId: partner.id, status: "SHIPPED", updatedAt: { gte: startOfToday } },
      }),
      prisma.partnerInventory.findMany({
        where: { partnerId: partner.id },
        select: {
          id: true,
          stockAvailable: true,
          stockReserved: true,
          variant: {
            select: { id: true, name: true, sku: true, product: { select: { name: true, slug: true } } },
          },
        },
      }),
      partner.partnerType === "AGENT"
        ? prisma.partner.count({
            where: { linkedAgentId: partner.id, partnerType: "DISTRIBUTOR", isActive: true },
          })
        : Promise.resolve(null),
    ]);

    const orders: Record<(typeof ASSIGNED_STATUSES)[number], number> = {
      CREATED: 0,
      CONFIRMED: 0,
      PROCESSING: 0,
      READY_TO_SHIP: 0,
    };
    for (const row of statusCounts) {
      if (row.status in orders) {
        orders[row.status as (typeof ASSIGNED_STATUSES)[number]] = row._count._all;
      }
    }

    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStockLines: Array<{
      variantId: string;
      productName: string;
      productSlug: string;
      variantName: string;
      sellable: number;
    }> = [];
    for (const row of inventoryRows) {
      const sellable = row.stockAvailable - row.stockReserved;
      if (sellable <= partner.lowStockThreshold) {
        lowStockCount += 1;
        lowStockLines.push({
          variantId: row.variant.id,
          productName: row.variant.product.name,
          productSlug: row.variant.product.slug,
          variantName: row.variant.name,
          sellable,
        });
      }
      if (sellable <= 0) outOfStockCount += 1;
    }
    lowStockLines.sort((a, b) => a.sellable - b.sellable);
    const topLowStockLines = lowStockLines.slice(0, 5);

    let restock: {
      pendingCount: number;
      recent: Array<{
        id: string;
        status: string;
        createdAt: Date;
        counterpartyName: string;
        itemCount: number;
      }>;
    };

    if (partner.partnerType === "AGENT") {
      const [pendingCount, recentRequests] = await Promise.all([
        prisma.restockRequest.count({ where: { sourcePartnerId: partner.id, status: "PENDING" } }),
        prisma.restockRequest.findMany({
          where: { sourcePartnerId: partner.id },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            createdAt: true,
            destinationPartner: { select: { name: true } },
            items: { select: { id: true } },
          },
        }),
      ]);
      restock = {
        pendingCount,
        recent: recentRequests.map((r) => ({
          id: r.id,
          status: r.status,
          createdAt: r.createdAt,
          counterpartyName: r.destinationPartner.name,
          itemCount: r.items.length,
        })),
      };
    } else {
      const [pendingCount, recentRequests] = await Promise.all([
        prisma.restockRequest.count({
          where: { destinationPartnerId: partner.id, status: { in: ["PENDING", "APPROVED"] } },
        }),
        prisma.restockRequest.findMany({
          where: { destinationPartnerId: partner.id },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            id: true,
            status: true,
            createdAt: true,
            sourcePartner: { select: { name: true } },
            items: { select: { id: true } },
          },
        }),
      ]);
      restock = {
        pendingCount,
        recent: recentRequests.map((r) => ({
          id: r.id,
          status: r.status,
          createdAt: r.createdAt,
          counterpartyName: r.sourcePartner.name,
          itemCount: r.items.length,
        })),
      };
    }

    return apiSuccess({
      partnerType: partner.partnerType,
      lowStockThreshold: partner.lowStockThreshold,
      orders: { ...orders, shippedToday },
      lowStockCount,
      outOfStockCount,
      topLowStockLines,
      restock,
      activeDistributorCount,
    });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
