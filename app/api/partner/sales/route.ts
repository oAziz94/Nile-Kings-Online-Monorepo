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
import { createStoreSale, SALE_TRANSACTION_TIMEOUT_MS, StoreSaleError } from "@/lib/sales/create-sale";
import { validateSaleBody } from "@/lib/sales/validation";

/** `POST /api/partner/sales` (backlog 11.3): record a counter sale. DISTRIBUTOR (outlet) only. */
export async function POST(req: NextRequest) {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({
      where: { id: user.partnerId },
      select: { partnerType: true },
    });
    if (partner?.partnerType !== "DISTRIBUTOR") return apiForbidden("هذه الصفحة متاحة للمنافذ فقط");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("جسم الطلب غير صالح");
    }
    const parsed = validateSaleBody(body);
    if (!parsed.ok) return apiBadRequest(parsed.message);

    try {
      const sale = await prisma.$transaction(
        (tx) =>
          createStoreSale(tx, { partnerId: user.partnerId, recordedByUserId: user.userId, sale: parsed.value }),
        { timeout: SALE_TRANSACTION_TIMEOUT_MS }
      );
      return apiSuccess({ sale }, undefined, 201);
    } catch (error) {
      if (error instanceof StoreSaleError) {
        if (error.status === 409) {
          return apiError("CONFLICT", error.publicMessage, { shortLines: error.shortLines ?? [] });
        }
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
