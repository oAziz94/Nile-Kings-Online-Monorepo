import { NextRequest } from "next/server";
import { requirePartner } from "@/lib/auth/session";
import { apiForbidden, apiUnauthorized } from "@/lib/api/response";
import { handleMoneyReport } from "@/lib/reports/handlers/money";

/**
 * `GET /api/partner/reports/money` (backlog 5.6b) — thin caller over the shared handler
 * (backlog 9.4b (a), B3); `app/api/admin/partners/[id]/reports/money/route.ts` calls the same
 * `handleMoneyReport` with an admin-resolved partner id. `?export=statement` streams the full
 * receipts+payments ledger as a CSV ("كشف حساب") regardless of the table's own page size.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requirePartner();
    return await handleMoneyReport(req, { partnerId: user.partnerId });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
