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

    return apiSuccess({
      distributors: distributors.map((distributor) => {
        const available = distributor.inventories.reduce((sum, row) => sum + row.stockAvailable, 0);
        const reserved = distributor.inventories.reduce((sum, row) => sum + row.stockReserved, 0);
        return {
          ...distributor,
          inventories: undefined,
          inventoryTotals: {
            available,
            reserved,
            sellable: Math.max(0, available - reserved),
          },
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
