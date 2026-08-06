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
    select: { id: true, sourcePartnerId: true },
  });
  if (!request) return apiNotFound("طلب إعادة التوريد غير موجود");
  if (request.sourcePartnerId !== user.partnerId) {
    return apiForbidden("غير مصرح بتعديل هذا الطلب");
  }

  let body: { action?: string; responseNotes?: string | null };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
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
      return apiSuccess(await fulfillRestockRequest({ restockRequestId: id, responseNotes }));
    }
    return apiBadRequest("action يجب أن يكون approve أو reject أو fulfill");
  } catch (error) {
    if (error instanceof InsufficientPartnerStockError) {
      return apiBadRequest("لا يوجد مخزون كافٍ لدى الوكيل لتنفيذ الطلب");
    }
    return apiBadRequest(error instanceof Error ? error.message : "تعذر تحديث طلب إعادة التوريد");
  }
}
