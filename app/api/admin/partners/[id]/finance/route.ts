import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiNotFound, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { getPartnerStatementRows, computeBalance } from "@/lib/analytics/partner-money-report";
import { PARTNER_NETWORK_DEFAULTS } from "@/lib/partner/settings-schema";

type Params = Promise<{ id: string }>;

/**
 * `GET /api/admin/partners/[id]/finance` (backlog 9.4a (e)) — the الحساب المالي tab's four
 * tiles + receipts/payments tables, built entirely from the money report's own arithmetic
 * (`getPartnerStatementRows` + `computeBalance`, B3 — no new balance computation).
 */
export async function GET(_req: Request, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id }, select: { costRateBps: true } });
  if (!partner) return apiNotFound("الشريك غير موجود");

  const { receipts, payments } = await getPartnerStatementRows(id);
  const receivedAllTimePiastres = receipts.reduce((s, r) => s + r.totalCostPiastres, 0);
  const receivedAllTimeUnits = receipts.reduce((s, r) => s + r.units, 0);
  const paidAllTimePiastres = payments.reduce((s, p) => s + p.amountPiastres, 0);
  const balancePiastres = computeBalance(receivedAllTimePiastres, paidAllTimePiastres);
  const nextDue = payments
    .filter((p) => p.dueAt)
    .sort((a, b) => new Date(a.dueAt as string).getTime() - new Date(b.dueAt as string).getTime())[0];

  return apiSuccess({
    costRateBps: partner.costRateBps,
    marginBps: 10_000 - partner.costRateBps,
    networkDefaultCostRateBps: PARTNER_NETWORK_DEFAULTS.costRateBps,
    receivedAllTimePiastres,
    receivedAllTimeUnits,
    paidAllTimePiastres,
    paidCount: payments.length,
    balancePiastres,
    nextDue: nextDue ? { amountPiastres: nextDue.amountPiastres, dueAt: nextDue.dueAt } : null,
    receipts,
    payments,
  });
}
