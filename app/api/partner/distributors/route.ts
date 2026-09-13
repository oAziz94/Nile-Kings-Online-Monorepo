import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";

export async function GET() {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({
      where: { id: user.partnerId },
      select: { partnerType: true },
    });
    if (partner?.partnerType !== "AGENT") {
      return apiForbidden("هذه الصفحة متاحة للوكلاء فقط");
    }

    const distributors = await prisma.partner.findMany({
      where: {
        linkedAgentId: user.partnerId,
        partnerType: "DISTRIBUTOR",
      },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        phone: true,
        governorate: true,
        facebookUrl: true,
        instagramUrl: true,
        tiktokUrl: true,
        youtubeUrl: true,
        websiteUrl: true,
        otherUrl: true,
        isActive: true,
        createdAt: true,
        user: { select: { email: true } },
        inventories: {
          select: { stockAvailable: true, stockReserved: true },
        },
      },
    });

    const distributorIds = distributors.map((d) => d.id);

    // Backlog 5.5, additive: roster cards need a pending-requests count and a last-activity
    // timestamp per distributor — neither existed on this endpoint before. Read-only
    // aggregates, no new mutation, same shape as before plus these two fields.
    const [pendingCounts, lastRequestUpdates, lastLedgerRows] =
      distributorIds.length > 0
        ? await Promise.all([
            prisma.restockRequest.groupBy({
              by: ["destinationPartnerId"],
              where: { sourcePartnerId: user.partnerId, destinationPartnerId: { in: distributorIds }, status: "PENDING" },
              _count: { _all: true },
            }),
            prisma.restockRequest.groupBy({
              by: ["destinationPartnerId"],
              where: { sourcePartnerId: user.partnerId, destinationPartnerId: { in: distributorIds } },
              _max: { updatedAt: true },
            }),
            prisma.inventoryLedger.groupBy({
              by: ["partnerId"],
              where: { partnerId: { in: distributorIds } },
              _max: { createdAt: true },
            }),
          ])
        : [[], [], []];

    const pendingCountMap = new Map(pendingCounts.map((row) => [row.destinationPartnerId, row._count._all]));
    const lastRequestMap = new Map(
      lastRequestUpdates.map((row) => [row.destinationPartnerId, row._max.updatedAt])
    );
    const lastLedgerMap = new Map(lastLedgerRows.map((row) => [row.partnerId, row._max.createdAt]));

    return apiSuccess({
      distributors: distributors.map((distributor) => {
        const available = distributor.inventories.reduce((sum, row) => sum + row.stockAvailable, 0);
        const reserved = distributor.inventories.reduce((sum, row) => sum + row.stockReserved, 0);
        const lastRequestAt = lastRequestMap.get(distributor.id) ?? null;
        const lastLedgerAt = lastLedgerMap.get(distributor.id) ?? null;
        const lastActivityAt =
          lastRequestAt && lastLedgerAt
            ? (lastRequestAt > lastLedgerAt ? lastRequestAt : lastLedgerAt)
            : lastRequestAt ?? lastLedgerAt ?? null;
        return {
          ...distributor,
          inventories: undefined,
          inventoryTotals: {
            available,
            reserved,
            sellable: Math.max(0, available - reserved),
          },
          pendingRequestsCount: pendingCountMap.get(distributor.id) ?? 0,
          lastActivityAt,
        };
      }),
    });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
