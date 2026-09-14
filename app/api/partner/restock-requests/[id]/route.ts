import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import {
  approveRestockRequest,
  fulfillRestockRequest,
  rejectRestockRequest,
} from "@/lib/inventory/restock-requests";
import { InsufficientPartnerStockError } from "@/lib/inventory/partner-inventory";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  let user;
  try {
    user = await requirePartner();
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }

  const { id } = await params;
  const request = await prisma.restockRequest.findUnique({
    where: { id },
    select: { id: true, sourcePartnerId: true, destinationPartnerId: true, status: true },
  });
  if (!request) return apiNotFound("طلب إعادة التوريد غير موجود");

  let body: { action?: string; responseNotes?: string | null };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  // Backlog 4.20 (d), allowed change: the *destination* partner (the distributor who
  // created the request) may cancel it while it is still PENDING. No stock movement,
  // ownership check independent of the source-partner check below (approve/reject/
  // fulfill's ownership check is otherwise untouched).
  if (body.action === "cancel") {
    if (request.destinationPartnerId !== user.partnerId) {
      return apiForbidden("غير مصرح بتعديل هذا الطلب");
    }
    if (request.status !== "PENDING") {
      return apiBadRequest("لا يمكن إلغاء الطلب في حالته الحالية");
    }
    const cancelled = await prisma.restockRequest.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
      include: { items: true, sourcePartner: true, destinationPartner: true },
    });
    return apiSuccess(cancelled, "تم إلغاء الطلب");
  }

  if (request.sourcePartnerId !== user.partnerId) {
    return apiForbidden("غير مصرح بتعديل هذا الطلب");
  }

  const responseNotes = body.responseNotes?.trim() || null;

  try {
    if (body.action === "approve") {
      return apiSuccess(await approveRestockRequest({ restockRequestId: id, responseNotes }));
    }
    if (body.action === "reject") {
      return apiSuccess(await rejectRestockRequest({ restockRequestId: id, responseNotes }));
    }
    if (body.action === "fulfill") {
      const fulfilled = await fulfillRestockRequest({ restockRequestId: id, responseNotes });
      // Backlog 9.7 (e) — mirror the source partner's stock transfer into `AdminAuditLog`
      // with `actorRole: "PARTNER"`. One place: this is the restock-request PATCH route's
      // only caller of `fulfillRestockRequest`.
      await logAdminAction(prisma, {
        actor: user,
        action: "update",
        entityType: "restock_request",
        entityId: id,
        entityLabel: `#${id.slice(-8)}`,
        before: { status: request.status },
        after: { status: "FULFILLED" },
        reason: responseNotes,
        ip: requestIp(req),
      });
      return apiSuccess(fulfilled);
    }
    return apiBadRequest("action يجب أن يكون approve أو reject أو fulfill");
  } catch (error) {
    if (error instanceof InsufficientPartnerStockError) {
      return apiBadRequest("لا يوجد مخزون كافٍ لدى الوكيل لتنفيذ الطلب");
    }
    return apiBadRequest(error instanceof Error ? error.message : "تعذر تحديث طلب إعادة التوريد");
  }
}
