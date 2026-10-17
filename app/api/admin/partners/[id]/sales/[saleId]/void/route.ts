import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  apiBadRequest,
  apiError,
  apiForbidden,
  apiNotFound,
  apiSuccess,
  apiUnauthorized,
} from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";
import { SALE_TRANSACTION_TIMEOUT_MS, StoreSaleError } from "@/lib/sales/create-sale";
import { validateVoidReason, voidStoreSale } from "@/lib/sales/void-sale";

/**
 * `POST /api/admin/partners/[id]/sales/[saleId]/void` (backlog 11.4): the admin cancels an outlet
 * receipt on any day. Same transaction as the outlet route (`actor: "ADMIN"`), audited in it.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; saleId: string }> }) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  let body: { reason?: unknown } | null;
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const reason = validateVoidReason(body?.reason);
  if (!reason.ok) return apiBadRequest(reason.message);

  const { id, saleId } = await params;
  try {
    const sale = await prisma.$transaction(
      async (tx) => {
        const voided = await voidStoreSale(tx, { partnerId: id, saleId, reason: reason.reason, actor: "ADMIN" });
        await logAdminAction(tx, {
          actor,
          action: "void_sale",
          entityType: "StoreSale",
          entityId: voided.id,
          entityLabel: `إيصال ${voided.receiptNo}`,
          before: { status: "COMPLETED" },
          after: { status: "VOIDED" },
          reason: reason.reason,
          ip: requestIp(req),
        });
        return voided;
      },
      { timeout: SALE_TRANSACTION_TIMEOUT_MS }
    );
    return apiSuccess({ sale });
  } catch (error) {
    if (error instanceof StoreSaleError) {
      if (error.status === 409) return apiError("CONFLICT", error.publicMessage);
      if (error.status === 403) return apiForbidden(error.publicMessage);
      if (error.status === 404) return apiNotFound(error.publicMessage);
      return apiBadRequest(error.publicMessage);
    }
    throw error;
  }
}
