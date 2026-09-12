import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiUnauthorized } from "@/lib/api/response";
import { isKidsCategory, getDisplaySizeLabel } from "@/lib/size-display";
import { buildInventoryExportXlsx, inventoryExportFilename } from "@/lib/inventory/receipts";

/**
 * GET /api/partner/inventory/export — backlog 4.23. Both partner roles (the export is the
 * intake/count template for AGENTs and a plain stock snapshot for DISTRIBUTORs); one row per
 * active variant, stock numbers scoped to the caller's own `PartnerInventory`, threshold from
 * the caller's own `Partner.lowStockThreshold`. Same role gate shape as
 * `app/api/partner/inventory/route.ts`'s `requireInventoryPartner` (kept local to this file —
 * that file is otherwise untouched per the standing rule).
 */
export async function GET() {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({
      where: { id: user.partnerId },
      select: { partnerType: true, lowStockThreshold: true },
    });
    if (!partner || !["AGENT", "DISTRIBUTOR"].includes(partner.partnerType)) {
      return apiForbidden("غير مصرح");
    }

    const variants = await prisma.variant.findMany({
      where: { product: { active: true } },
      orderBy: [{ product: { sortOrder: "desc" } }, { product: { createdAt: "desc" } }],
      select: {
        sku: true,
        name: true,
        colorName: true,
        product: {
          select: {
            name: true,
            category: { select: { slug: true } },
          },
        },
        partnerInventories: {
          where: { partnerId: user.partnerId },
          select: { stockAvailable: true, stockReserved: true },
        },
      },
    });

    const rows = variants.map((variant) => {
      const inventory = variant.partnerInventories[0] ?? null;
      const forKids = isKidsCategory(variant.product.category?.slug);
      return {
        sku: variant.sku,
        productName: variant.product.name,
        sizeLabel: getDisplaySizeLabel(variant.name, forKids),
        colorName: variant.colorName,
        stockAvailable: inventory?.stockAvailable ?? 0,
        stockReserved: inventory?.stockReserved ?? 0,
      };
    });

    const buffer = buildInventoryExportXlsx(rows, partner.lowStockThreshold);
    const filename = inventoryExportFilename(new Date());

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
