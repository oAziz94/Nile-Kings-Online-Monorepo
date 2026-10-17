import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { apiForbidden, apiNotFound, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { getStoreSaleForPartner } from "@/lib/sales/get-sale";

/** `GET /api/partner/sales/[id]` (backlog 11.3): one sale of the caller's own outlet, for the receipt view. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requirePartner();
    const { id } = await params;
    const sale = await getStoreSaleForPartner(user.partnerId, id);
    if (!sale) return apiNotFound("الإيصال غير موجود");
    return apiSuccess({ sale });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
