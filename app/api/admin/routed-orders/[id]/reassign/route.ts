import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";

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
    include: { order: true },
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
    select: { id: true },
  });
  if (!partner) return apiBadRequest("الشريك غير موجود");

  const auditNote = `إعادة تعيين يدوي إلى شريك ${partnerId}. ${body.notes ?? ""}`.trim();

  const updated = await prisma.routedOrder.update({
    where: { id: routedOrderId },
    data: {
      partnerId,
      assignmentMode: "MANUAL",
      status: "ASSIGNED",
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
  return apiSuccess(updated);
}
