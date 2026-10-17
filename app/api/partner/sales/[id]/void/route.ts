import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  apiBadRequest,
  apiError,
  apiForbidden,
  apiNotFound,
  apiSuccess,
  apiUnauthorized,
} from "@/lib/api/response";
import { SALE_TRANSACTION_TIMEOUT_MS, StoreSaleError } from "@/lib/sales/create-sale";
import { validateVoidReason, voidStoreSale } from "@/lib/sales/void-sale";

/** `POST /api/partner/sales/[id]/void` (backlog 11.4): the outlet cancels its own receipt, same Cairo day only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({
      where: { id: user.partnerId },
      select: { partnerType: true },
    });
    if (partner?.partnerType !== "DISTRIBUTOR") return apiForbidden("هذه الصفحة متاحة للمنافذ فقط");

    let body: { reason?: unknown } | null;
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("جسم الطلب غير صالح");
    }
    const reason = validateVoidReason(body?.reason);
    if (!reason.ok) return apiBadRequest(reason.message);

    const { id } = await params;
    try {
      const sale = await prisma.$transaction(
        (tx) => voidStoreSale(tx, { partnerId: user.partnerId, saleId: id, reason: reason.reason, actor: "OUTLET" }),
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
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
