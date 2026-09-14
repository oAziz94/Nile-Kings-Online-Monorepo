import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { apiForbidden, apiUnauthorized } from "@/lib/api/response";
import { handleFulfilmentReport } from "@/lib/reports/handlers/fulfilment";

/** `GET /api/admin/reports/fulfilment` (backlog 9.6 (b)) — see the sales route's sibling. */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  return handleFulfilmentReport(req, { network: true });
}
