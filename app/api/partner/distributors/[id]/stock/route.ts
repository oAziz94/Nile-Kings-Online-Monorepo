import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiNotFound, apiSuccess, apiUnauthorized } from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

/**
 * Backlog 5.5 — read-only aggregate for the network detail sheet's "their stock" table.
 * AGENT-only, and only for a distributor linked to the calling agent (no cross-agent
 * reads). No mutation; the same `PartnerInventory`/`Variant` join already used inline for
 * the restock-requests destination-stock lookup (`app/api/partner/restock-requests/route.ts`),
 * just returning every line for one distributor instead of a variant-id subset.
 */
export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({
      where: { id: user.partnerId },
      select: { partnerType: true },
    });
    if (partner?.partnerType !== "AGENT") {
      return apiForbidden("هذه الصفحة متاحة للوكلاء فقط");
    }

    const { id } = await params;
    const distributor = await prisma.partner.findUnique({
      where: { id },
      select: { id: true, linkedAgentId: true, partnerType: true, name: true },
    });
    if (
      !distributor ||
      distributor.partnerType !== "DISTRIBUTOR" ||
      distributor.linkedAgentId !== user.partnerId
    ) {
      return apiNotFound("الموزع غير موجود");
    }

    const inventory = await prisma.partnerInventory.findMany({
      where: { partnerId: id },
      orderBy: [{ stockAvailable: "desc" }],
      select: {
        variantId: true,
        stockAvailable: true,
        stockReserved: true,
        variant: {
          select: {
            id: true,
            sku: true,
            name: true,
            colorName: true,
            product: { select: { name: true } },
          },
        },
      },
    });

    return apiSuccess({
      distributor: { id: distributor.id, name: distributor.name },
      stock: inventory.map((row) => ({
        variant: row.variant,
        stockAvailable: row.stockAvailable,
        stockReserved: row.stockReserved,
        sellable: Math.max(0, row.stockAvailable - row.stockReserved),
      })),
    });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
