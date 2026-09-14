import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { apiForbidden, apiUnauthorized } from "@/lib/api/response";
import { handleFulfilmentReport } from "@/lib/reports/handlers/fulfilment";

/**
 * `GET /api/partner/reports/fulfilment` (backlog 5.6b) — thin caller over the shared handler
 * (backlog 9.4b (a), B3); `app/api/admin/partners/[id]/reports/fulfilment/route.ts` calls the
 * same `handleFulfilmentReport` with an admin-resolved partner id.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requirePartner();
    return await handleFulfilmentReport(req, { partnerId: user.partnerId });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
