import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { apiForbidden, apiUnauthorized } from "@/lib/api/response";
import { handleNetworkReport } from "@/lib/reports/handlers/network";

/**
 * `GET /api/partner/reports/network` (backlog 5.6b) — AGENT only, same 403 gate as
 * `/api/partner/distributors` (backlog 5.5). Thin caller over the shared handler (backlog
 * 9.4b (a), B3); `app/api/admin/partners/[id]/reports/network/route.ts` calls the same
 * `handleNetworkReport` with an admin-resolved partner id (after its own 400 pre-check for a
 * non-agent target).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requirePartner();
    return await handleNetworkReport(req, user.partnerId);
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
