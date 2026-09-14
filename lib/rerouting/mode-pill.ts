/**
 * Backlog 9.5(a) — the التوجيه matrix's per-governorate mode pill and 30-day share
 * arithmetic. Pure, no Prisma, so both are directly unit-testable (vitest).
 *
 * Mode decision: a governorate row is "تلقائي" (auto) when its rule is active AND has
 * two or more active partners; "شريك واحد فقط" (single, warn tone) with exactly one
 * active partner (rule active or not is irrelevant once there's exactly one — the row
 * still routes; ambiguity is intentionally resolved toward "still works, but fragile");
 * "الطلبات تنتظر إسنادًا يدويًا" (danger) with zero active partners, or when the rule
 * itself is inactive (manual mode) regardless of partner count.
 */
export type RoutingModePill = "auto" | "single" | "danger";

export function computeRoutingModePill(activePartnerCount: number, ruleIsActive: boolean): RoutingModePill {
  if (!ruleIsActive) return "danger";
  if (activePartnerCount <= 0) return "danger";
  if (activePartnerCount === 1) return "single";
  return "auto";
}

/** Rounded integer percentage of `count` out of `total`; 0 when `total` is 0 (never NaN/÷0). */
export function computeSharePercent(count: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((count / total) * 100);
}
