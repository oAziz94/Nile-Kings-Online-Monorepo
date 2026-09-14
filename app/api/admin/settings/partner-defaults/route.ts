import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getPartnerNetworkDefaults, setPartnerNetworkDefaults } from "@/lib/settings";
import { partnerNetworkDefaultsSchema } from "@/lib/partner/settings-schema";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { prisma } from "@/lib/db";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";

/**
 * `GET/PATCH /api/admin/settings/partner-defaults` (backlog 9.7 (a)) — the network defaults
 * every new partner inherits at creation: نسبة الشراء (`costRateBps`), مهلة التأكيد
 * (`confirmSlaHours`), مهلة الشحن (`shipSlaHours`), حد المخزون المنخفض (`lowStockThreshold`),
 * راكد بعد (`deadStockDays`), تغطية مستهدفة (`targetCoverDays`). Stored under `SiteSetting`
 * key `partnerDefaults`; changing them never touches an existing partner.
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
  return apiSuccess(await getPartnerNetworkDefaults());
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
  const before = await getPartnerNetworkDefaults();
  const parsed = partnerNetworkDefaultsSchema.safeParse({ ...before, ...(body as object) });
  if (!parsed.success) {
    return apiBadRequest("قيم غير صالحة: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
  }
  const after = await setPartnerNetworkDefaults(parsed.data);
  await logAdminAction(prisma, {
    actor,
    action: "update",
    entityType: "settings",
    entityId: "partner-defaults",
    entityLabel: "افتراضيات الشبكة",
    before: { ...before },
    after: { ...after },
    ip: requestIp(req),
  });
  return apiSuccess(after);
}
