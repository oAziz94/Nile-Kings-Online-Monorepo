import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { apiForbidden, apiUnauthorized } from "@/lib/api/response";
import { handleSalesReport } from "@/lib/reports/handlers/sales";

/**
 * `GET /api/admin/reports/sales` (backlog 9.6 (b)) — the network-wide sales report, through
 * the exact same handler the partner and admin-per-partner routes call (B3), with the
 * `{ network: true }` scope instead of a resolved partner id.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  return handleSalesReport(req, { network: true });
}
