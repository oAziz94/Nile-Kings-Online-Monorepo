import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import { computeRoutingModePill, computeSharePercent } from "@/lib/rerouting/mode-pill";
import { cairoDateIso, addDaysIsoUtc, cairoStartOfDayUtc } from "@/lib/analytics/cairo-day";

/**
 * `GET /api/admin/routing` (backlog 9.5a) — one row per governorate from `GOVERNORATE_OPTIONS`
 * (every governorate the storefront can ship to, whether or not a `ReroutingRule` row exists
 * for it), computed with one `Promise.all` and one grouped 30-day-share query (not one query
 * per governorate). Writes go through the existing `/api/admin/rerouting-rules*` routes —
 * this route is read-only.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }

  const since = cairoStartOfDayUtc(addDaysIsoUtc(cairoDateIso(new Date()), -29));

  const [rules, sharesOrders] = await Promise.all([
    prisma.reroutingRule.findMany({
      include: {
        partners: {
          orderBy: { createdAt: "asc" },
          include: { partner: { select: { id: true, name: true, phone: true, partnerType: true, isActive: true } } },
        },
      },
    }),
    // One grouped query for every governorate's 30-day partner shares, not one per governorate.
    prisma.order.findMany({
      where: { assignedPartnerId: { not: null }, createdAt: { gte: since } },
      select: { assignedPartnerId: true, shippingAddress: true },
    }),
  ]);

  const shareMap = new Map<string, Map<string, number>>(); // governorate -> partnerId -> count
  for (const order of sharesOrders) {
    const addr = order.shippingAddress as { governorate?: string } | null;
    const governorate = (addr?.governorate ?? "").toString().trim();
    if (!governorate || !order.assignedPartnerId) continue;
    const byPartner = shareMap.get(governorate) ?? new Map<string, number>();
    byPartner.set(order.assignedPartnerId, (byPartner.get(order.assignedPartnerId) ?? 0) + 1);
    shareMap.set(governorate, byPartner);
  }

  const ruleByGovernorate = new Map(rules.map((r) => [r.governorate, r]));

  const rows = GOVERNORATE_OPTIONS.map((g) => {
    const rule = ruleByGovernorate.get(g.value) ?? null;
    const byPartner = shareMap.get(g.value) ?? new Map<string, number>();
    const totalOrders30d = Array.from(byPartner.values()).reduce((s, n) => s + n, 0);

    const partners = (rule?.partners ?? []).map((link) => ({
      linkId: link.id,
      partnerId: link.partnerId,
      name: link.partner.name,
      partnerType: link.partner.partnerType,
      isActive: link.isActive,
      orders30d: byPartner.get(link.partnerId) ?? 0,
      sharePercent: computeSharePercent(byPartner.get(link.partnerId) ?? 0, totalOrders30d),
    }));

    const activePartnerCount = partners.filter((p) => p.isActive).length;
    const mode = computeRoutingModePill(activePartnerCount, rule?.isActive ?? false);

    return {
      governorate: g.value,
      governorateLabel: g.label,
      ruleId: rule?.id ?? null,
      isActive: rule?.isActive ?? false,
      partners,
      totalOrders30d,
      mode,
    };
  });

  return apiSuccess({ rows });
}
