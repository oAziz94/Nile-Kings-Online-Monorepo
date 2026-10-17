import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { apiForbidden, apiNotFound, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { getStoreSaleForPartner } from "@/lib/sales/get-sale";

/** `GET /api/admin/partners/[id]/sales/[saleId]` (backlog 11.6): one receipt of that outlet, for the admin drawer. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; saleId: string }> }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id, saleId } = await params;
  const sale = await getStoreSaleForPartner(id, saleId);
  if (!sale) return apiNotFound("الإيصال غير موجود");
  return apiSuccess({ sale });
}
