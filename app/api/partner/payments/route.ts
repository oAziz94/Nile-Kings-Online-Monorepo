import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";

/**
 * `GET /api/partner/payments` (backlog 5.1) — read-only list of the partner's own
 * `PartnerPayment` rows, admin-recorded (`POST /api/admin/partners/[id]/payments`).
 * `05-partner-portal-v2.md` §1: "Partners read it." No partner route writes this table
 * (rule 18's spirit extends to payments — settlement facts are admin-only writes).
 */
export async function GET() {
  try {
    const user = await requirePartner();
    const payments = await prisma.partnerPayment.findMany({
      where: { partnerId: user.partnerId },
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        kind: true,
        amountPiastres: true,
        paidAt: true,
        dueAt: true,
        reference: true,
        notes: true,
        stockReceiptId: true,
      },
    });
    return apiSuccess({ payments });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
