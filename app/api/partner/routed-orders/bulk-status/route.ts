import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import {
  ORDER_STATUSES,
  PartnerOrderTransitionError,
  transitionPartnerOrderStatus,
} from "@/lib/orders/partner-status-transition";

/**
 * Bulk status change for the AGENT orders list (backlog 4.19, "تغيير حالة المحددة" — the
 * bulk action on the selection). Same AGENT-only gate as `app/api/partner/orders/[id]/route.ts`
 * (`requireAgentPartner`, copied exactly — no shared export exists to reuse), same
 * per-order ownership check (`assignedPartnerId`) via `transitionPartnerOrderStatus`, and
 * — the point of this endpoint — one `prisma.$transaction` per order (inside
 * `transitionPartnerOrderStatus`), so a single order's insufficient-stock 400 does not
 * roll back the others. Every order's outcome is reported back, not just the first failure.
 */
async function requireAgentPartner() {
  const user = await requirePartner();
  const partner = await prisma.partner.findUnique({
    where: { id: user.partnerId },
    select: { partnerType: true },
  });
  if (partner?.partnerType !== "AGENT") {
    const err = new Error("FORBIDDEN");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return user;
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAgentPartner();

    let body: { orderIds?: unknown; status?: unknown };
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("جسم الطلب غير صالح");
    }

    const orderIds = Array.isArray(body.orderIds)
      ? body.orderIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];
    const status = typeof body.status === "string" ? body.status : "";

    if (orderIds.length === 0) {
      return apiBadRequest("اختر طلبًا واحدًا على الأقل");
    }
    if (!ORDER_STATUSES.includes(status as (typeof ORDER_STATUSES)[number])) {
      return apiBadRequest("حالة الطلب غير صالحة");
    }

    const results: { id: string; ok: boolean; message?: string }[] = [];
    for (const orderId of orderIds) {
      try {
        await transitionPartnerOrderStatus({ partnerId: user.partnerId, orderId, nextStatus: status, actor: user });
        results.push({ id: orderId, ok: true });
      } catch (error) {
        if (error instanceof PartnerOrderTransitionError) {
          results.push({ id: orderId, ok: false, message: error.message });
        } else {
          results.push({ id: orderId, ok: false, message: "خطأ غير متوقع" });
        }
      }
    }

    return apiSuccess({ results });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
