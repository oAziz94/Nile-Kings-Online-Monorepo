import { requireAdmin } from "@/lib/auth/session";
import { apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { getAdminToday } from "@/lib/admin/today";

/**
 * GET /api/admin/today (backlog 9.2) — everything اليوم renders: the six queue cards, four
 * network KPIs, the 30-day trend, and آخر النشاط. `requireAdmin()`-gated, read-only, every
 * number computed by `lib/admin/today.ts` (which itself calls existing `lib/**` functions
 * widened in scope, per rule B3 — never a re-implementation).
 */
export async function GET() {
  try {
    const user = await requireAdmin();
    const data = await getAdminToday(user.userId);
    return apiSuccess(data);
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
