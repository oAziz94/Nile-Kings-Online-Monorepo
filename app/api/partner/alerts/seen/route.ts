import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";

/**
 * POST /api/partner/alerts/seen (backlog 4.17) — sets `Partner.alertsSeenAt = now()`.
 * Called when the bell `Popover` opens. No body.
 */
export async function POST() {
  try {
    const user = await requirePartner();
    const updated = await prisma.partner.update({
      where: { id: user.partnerId },
      data: { alertsSeenAt: new Date() },
      select: { alertsSeenAt: true },
    });
    return apiSuccess({ alertsSeenAt: updated.alertsSeenAt?.toISOString() ?? null });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
