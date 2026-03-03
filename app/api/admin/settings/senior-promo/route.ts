import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { isSeniorPromoEnabled, setSeniorPromoEnabled } from "@/lib/settings";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";

/**
 * GET /api/admin/settings/senior-promo
 * Admin: current senior promotion enabled state.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const enabled = await isSeniorPromoEnabled();
  return apiSuccess({ enabled });
}

/**
 * PATCH /api/admin/settings/senior-promo
 * Body: { enabled: boolean }
 * Admin: toggle senior promotion on/off.
 */
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  let body: { enabled?: boolean };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  if (typeof body.enabled !== "boolean") {
    return apiBadRequest("enabled يجب أن يكون true أو false");
  }
  await setSeniorPromoEnabled(body.enabled);
  return apiSuccess({ enabled: body.enabled });
}
