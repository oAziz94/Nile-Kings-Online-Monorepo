import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import {
  InsufficientPartnerStockError,
  reassignReservedPartnerStock,
} from "@/lib/inventory/partner-inventory";

type Params = Promise<{ id: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id: routedOrderId } = await params;
  const routed = await prisma.routedOrder.findUnique({
    where: { id: routedOrderId },
    include: {
      order: {
        include: {
          items: { select: { variantId: true, quantity: true } },
        },
      },
    },
  });
  if (!routed) return apiNotFound("السجل غير موجود");

  let body: { partnerId?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const partnerId = typeof body.partnerId === "string" ? body.partnerId.trim() : "";
  if (!partnerId) return apiBadRequest("partnerId مطلوب");

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true, governorate: true },
  });
  if (!partner) return apiBadRequest("الشريك غير موجود");

  const auditNote = `إعادة تعيين يدوي إلى شريك ${partnerId}. ${body.notes ?? ""}`.trim();

  try {
    const updated = await prisma.$transaction(
      async (tx) => {
        await reassignReservedPartnerStock({
          tx,
          routedOrderId,
          oldPartnerId: routed.partnerId,
          newPartnerId: partnerId,
          orderId: routed.orderId,
          orderStatus: routed.order.status,
          lines: routed.order.items.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
          })),
          notes: "Admin reassignment",
        });

        await tx.order.update({
          where: { id: routed.orderId },
          data: {
            assignedPartnerId: partnerId,
            shippingOriginGovernorate: partner.governorate,
          },
        });

        return tx.routedOrder.update({
          where: { id: routedOrderId },
          data: {
            partnerId,
            assignmentMode: "MANUAL",
            status: "ASSIGNED",
            notifiedAt: null,
            notificationError: null,
            notes: routed.notes ? `${routed.notes}\n${auditNote}` : auditNote,
          },
          include: {
            order: {
              include: {
                user: { select: { id: true, phone: true, name: true } },
                items: { select: { productName: true, variantName: true, quantity: true } },
              },
            },
            partner: { select: { id: true, name: true, phone: true, partnerType: true } },
            rule: { select: { id: true, governorate: true } },
          },
        });
      },
      { maxWait: 15_000, timeout: 60_000 }
    );
    return apiSuccess(updated);
  } catch (error) {
    if (error instanceof InsufficientPartnerStockError) {
      return apiBadRequest("الشريك الجديد لا يملك مخزوناً كافياً لهذا الطلب");
    }
    throw error;
  }
}
