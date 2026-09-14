import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import { getSiteSetting, setSiteSetting } from "@/lib/settings";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";

/**
 * `GET/PATCH /api/admin/settings/alert-prefs` (backlog 9.7 (b)) — the admin's own six alert
 * toggles ("الإشعارات" group, `Settings.dc.html`), stored as one JSON row under `SiteSetting`
 * key `adminAlertPrefs`. Read by nothing yet — 9.2's bell reads them in a follow-up task; this
 * task only has to make the toggles persist.
 */
const ALERT_PREFS_KEY = "adminAlertPrefs";

const DEFAULTS: Record<string, boolean> = {
  unassignedOrderOverHour: true,
  orderOverdueSla: true,
  newTicket: true,
  newPartnerRequest: true,
  partnerInstallmentDue: true,
  partnerOutOfStock: false,
};

async function readPrefs(): Promise<Record<string, boolean>> {
  const raw = await getSiteSetting(ALERT_PREFS_KEY);
  if (!raw) return { ...DEFAULTS };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return { ...DEFAULTS, ...parsed };
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULTS };
}

export async function GET() {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  return apiSuccess(await readPrefs());
}

export async function PATCH(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  if (!body || typeof body !== "object") return apiBadRequest("جسم الطلب غير صالح");

  const before = await readPrefs();
  const next: Record<string, boolean> = { ...before };
  for (const key of Object.keys(DEFAULTS)) {
    const v = (body as Record<string, unknown>)[key];
    if (typeof v === "boolean") next[key] = v;
  }

  await setSiteSetting(ALERT_PREFS_KEY, JSON.stringify(next));
  await logAdminAction(prisma, {
    actor,
    action: "update",
    entityType: "settings",
    entityId: "alert-prefs",
    entityLabel: "تفضيلات الإشعارات",
    before,
    after: next,
    ip: requestIp(req),
  });
  return apiSuccess(next);
}
