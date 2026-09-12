import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiNotFound, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { isKidsCategory, getDisplaySizeLabel } from "@/lib/size-display";

/** GET /api/partner/receipts/[id] — backlog 4.23. AGENT only, ownership-checked. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({
      where: { id: user.partnerId },
      select: { partnerType: true, name: true },
    });
    if (partner?.partnerType !== "AGENT") {
      return apiForbidden("هذه الصفحة متاحة للوكلاء فقط");
    }

    const { id } = await params;
    const receipt = await prisma.stockReceipt.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            variant: {
              select: {
                sku: true,
                name: true,
                colorName: true,
                product: { select: { name: true, category: { select: { slug: true } } } },
              },
            },
          },
        },
      },
    });

    if (!receipt || receipt.partnerId !== user.partnerId) {
      return apiNotFound("الإيصال غير موجود");
    }

    const lines = receipt.lines.map((line) => {
      const forKids = isKidsCategory(line.variant.product.category?.slug);
      const sizeLabel = getDisplaySizeLabel(line.variant.name, forKids);
      return {
        id: line.id,
        variantId: line.variantId,
        sku: line.variant.sku,
        product: line.variant.product.name,
        variant: line.variant.colorName ? `${sizeLabel} · ${line.variant.colorName}` : sizeLabel,
        quantity: line.quantity,
        previousAvailable: line.previousAvailable,
        newAvailable: line.newAvailable,
      };
    });

    return apiSuccess({
      id: receipt.id,
      kind: receipt.kind,
      reference: receipt.reference,
      notes: receipt.notes,
      createdAt: receipt.createdAt,
      partnerName: partner.name,
      lines,
      totalUnits: lines.reduce((sum, l) => sum + Math.abs(l.quantity), 0),
    });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
