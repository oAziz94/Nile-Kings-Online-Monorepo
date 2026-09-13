/**
 * Ledger-accurate stock-out days (backlog 7.5) — the inventory report's "أيام نفاد"
 * headline: per-SKU count of calendar days within a period where the ledger-reconstructed
 * end-of-day sellable (available - reserved) balance was <= 0, summed across SKUs.
 *
 * Pure — no Prisma import — so the walk is directly unit-testable with a hand-built ledger.
 * The caller (`partner-inventory-report.ts`) supplies each variant's *current* sellable
 * balance plus its ledger entries; this module walks backwards from "now" by undoing every
 * entry newer than a given day's close, one day at a time, rather than replaying forward
 * from some assumed starting balance (there is no reliable "balance at time zero" to start
 * a forward walk from).
 */

export type LedgerDelta = {
  createdAt: Date;
  quantityAvailableDelta: number;
  quantityReservedDelta: number;
};

export type VariantStockOutInput = {
  variantId: string;
  /** The sellable (available - reserved) balance right now, at the instant `entries`
   * already fully reflects. */
  currentSellable: number;
  entries: LedgerDelta[];
};

function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIsoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** The exclusive end-of-day boundary (midnight starting the next day) for a calendar day. */
function dayEndExclusive(dayIso: string): Date {
  const d = parseIsoLocal(dayIso);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * Reconstructs a variant's end-of-day sellable balance for one calendar day: `currentSellable`
 * already includes every ledger entry up to now, so subtracting the combined delta of every
 * entry that happened at or after this day's close walks the balance back to what it was
 * when that day ended.
 */
function balanceAtDayEnd(currentSellable: number, entries: LedgerDelta[], dayIso: string): number {
  const boundary = dayEndExclusive(dayIso);
  let laterDelta = 0;
  for (const entry of entries) {
    if (entry.createdAt >= boundary) {
      laterDelta += entry.quantityAvailableDelta - entry.quantityReservedDelta;
    }
  }
  return currentSellable - laterDelta;
}

/** Every calendar day in `[fromIso, toIso]`, inclusive of both ends. */
export function eachDayIso(fromIso: string, toIso: string): string[] {
  const days: string[] = [];
  let cursor = parseIsoLocal(fromIso);
  const end = parseIsoLocal(toIso);
  while (cursor.getTime() <= end.getTime()) {
    days.push(toIsoLocal(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
  }
  return days;
}

/** Count of days in `[fromIso, toIso]` where this variant's reconstructed end-of-day
 * sellable balance was <= 0 (stocked out, or oversold into negative). */
export function countStockOutDaysForVariant(input: VariantStockOutInput, fromIso: string, toIso: string): number {
  let count = 0;
  for (const dayIso of eachDayIso(fromIso, toIso)) {
    if (balanceAtDayEnd(input.currentSellable, input.entries, dayIso) <= 0) count += 1;
  }
  return count;
}

/** Summed across every SKU — the full "أيام نفاد" headline value for one period. */
export function sumStockOutDays(rows: VariantStockOutInput[], fromIso: string, toIso: string): number {
  return rows.reduce((sum, row) => sum + countStockOutDaysForVariant(row, fromIso, toIso), 0);
}
