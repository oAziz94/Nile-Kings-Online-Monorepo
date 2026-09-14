import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { apiForbidden, apiUnauthorized } from "@/lib/api/response";
import { handleSalesReport } from "@/lib/reports/handlers/sales";

/**
 * `GET /api/partner/reports/sales` (backlog 5.6a) — thin caller over the shared handler
 * (backlog 9.4b (a), B3); `app/api/admin/partners/[id]/reports/sales/route.ts` calls the same
 * `handleSalesReport` with an admin-resolved partner id.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requirePartner();
    return await handleSalesReport(req, { partnerId: user.partnerId });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
