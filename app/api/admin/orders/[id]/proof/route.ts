import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { logAdminAction, requestIp, sanitizeForAudit } from "@/lib/audit/admin-audit";

type Params = Promise<{ id: string }>;

/**
 * PATCH /api/admin/orders/[id]/proof — delivery-proof photo on the order's `RoutedOrder`
 * (backlog 9.3 d), the power the old `/admin/routed-orders` detail offered. Creates a
 * `RoutedOrder` (MANUAL) if the order has a partner but somehow no routed row yet; refuses
 * when the order has no assigned partner at all.
 */
export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id: orderId } = await params;

  let body: { proofImageUrl?: string; proofImagePublicId?: string | null };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const proofImageUrl = typeof body.proofImageUrl === "string" ? body.proofImageUrl.trim() : "";
  if (!proofImageUrl) return apiBadRequest("رابط صورة الإثبات مطلوب");
  const proofImagePublicId =
    typeof body.proofImagePublicId === "string" && body.proofImagePublicId.trim()
      ? body.proofImagePublicId.trim()
      : null;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { routedOrder: true },
  });
  if (!order) return apiNotFound("الطلب غير موجود");
  if (!order.assignedPartnerId) return apiBadRequest("لا يمكن رفع إثبات تسليم لطلب بلا شريك");

  const before = order.routedOrder ? sanitizeForAudit(order.routedOrder) : null;

  const routed = order.routedOrder
    ? await prisma.routedOrder.update({
        where: { id: order.routedOrder.id },
        data: { proofImageUrl, proofImagePublicId },
      })
    : await prisma.routedOrder.create({
        data: {
          orderId,
          governorate: order.shippingOriginGovernorate ?? "—",
          partnerId: order.assignedPartnerId,
          assignmentMode: "MANUAL",
          status: "ASSIGNED",
          proofImageUrl,
          proofImagePublicId,
        },
      });

  await logAdminAction(prisma, {
    actor: admin,
    action: "proof_of_delivery",
    entityType: "order",
    entityId: orderId,
    entityLabel: `#${orderId.slice(-8)}`,
    before,
    after: sanitizeForAudit(routed),
    ip: requestIp(req),
  });

  return apiSuccess({ proofImageUrl: routed.proofImageUrl, proofImagePublicId: routed.proofImagePublicId });
}
