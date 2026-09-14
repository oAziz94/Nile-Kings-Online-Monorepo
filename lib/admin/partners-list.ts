/**
 * الشركاء list health columns (backlog 9.4a (d), `06-admin-v2.md` §3.4). Every number calls
 * an existing `lib/**` function widened in scope (rule B3): `findOverdueAssignedOrders` (the
 * partner today route's own overdue query), `computePartnerStockTotals` (the inventory
 * report's own cover-days aggregation), `getPartnerStatementRows` + `computeBalance` (the
 * money report's own arithmetic). Computed concurrently across partners with `Promise.all`
 * (the 9.2 rule).
 *
 * `coverTone` is kept pure/Prisma-free so it is directly unit-testable
 * (`lib/admin/partners-list.test.ts`).
 */
import { prisma } from "@/lib/db";
import { findOverdueAssignedOrders } from "@/lib/partner/today";
import { computePartnerStockTotals } from "@/lib/analytics/partner-stock-totals";
import { getPartnerStatementRows, computeBalance } from "@/lib/analytics/partner-money-report";

export type CoverTone = "d" | "w" | "s";

/** Tone thresholds per the artboard: dangerous (<7 days), watch (<21 days), else safe.
 * `null` (no measurable sales velocity) has no tone — the caller renders "—". */
export function coverTone(coverDays: number | null): CoverTone | null {
  if (coverDays === null) return null;
  if (coverDays < 7) return "d";
  if (coverDays < 21) return "w";
  return "s";
}

export type PartnerHealth = {
  partnerId: string;
  openOrders: number;
  overdueOrders: number;
  overduePct: number;
  coverDays: number | null;
  coverTone: CoverTone | null;
  balancePiastres: number;
  nextDueAt: string | null;
  /** Any of: overdue > 0, cover < 7 days, balance due (> 0). */
  needsAttention: boolean;
};

async function computeOnePartnerHealth(partnerId: string): Promise<PartnerHealth> {
  const [openOrders, overdue, stockTotals, statement] = await Promise.all([
    prisma.order.count({
      where: { assignedPartnerId: partnerId, status: { notIn: ["DELIVERED", "CANCELLED"] } },
    }),
    findOverdueAssignedOrders({ partnerId }),
    computePartnerStockTotals(partnerId),
    getPartnerStatementRows(partnerId),
  ]);

  const overdueOrders = overdue.length;
  const overduePct = openOrders > 0 ? Math.round((overdueOrders / openOrders) * 100) : 0;

  const receivedAllTime = statement.receipts.reduce((s, r) => s + r.totalCostPiastres, 0);
  const paidAllTime = statement.payments.reduce((s, p) => s + p.amountPiastres, 0);
  const balancePiastres = computeBalance(receivedAllTime, paidAllTime);

  const nextDue = statement.payments
    .filter((p) => p.dueAt)
    .sort((a, b) => new Date(a.dueAt as string).getTime() - new Date(b.dueAt as string).getTime())[0];

  const tone = coverTone(stockTotals.coverDays);
  const needsAttention = overdueOrders > 0 || tone === "d" || balancePiastres > 0;

  return {
    partnerId,
    openOrders,
    overdueOrders,
    overduePct,
    coverDays: stockTotals.coverDays,
    coverTone: tone,
    balancePiastres,
    nextDueAt: nextDue?.dueAt ?? null,
    needsAttention,
  };
}

/** Computes health for every partner id concurrently (9.2 rule: fan-out with `Promise.all`,
 * never a loop of sequential awaits). */
export async function computePartnersHealth(partnerIds: string[]): Promise<Map<string, PartnerHealth>> {
  const rows = await Promise.all(partnerIds.map((id) => computeOnePartnerHealth(id)));
  return new Map(rows.map((r) => [r.partnerId, r]));
}
