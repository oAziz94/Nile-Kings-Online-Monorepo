import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { apiForbidden, apiUnauthorized } from "@/lib/api/response";
import { handleInventoryReport } from "@/lib/reports/handlers/inventory";

/**
 * `GET /api/partner/reports/inventory` (backlog 5.6a) — thin caller over the shared handler
 * (backlog 9.4b (a), B3); `app/api/admin/partners/[id]/reports/inventory/route.ts` calls the
 * same `handleInventoryReport` with an admin-resolved partner id. `?export=reorder` streams
 * the reorder list as a CSV in the factory intake format instead of the JSON report.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requirePartner();
    return await handleInventoryReport(req, { partnerId: user.partnerId });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
