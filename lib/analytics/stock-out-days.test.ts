import { describe, expect, it } from "vitest";
import { countStockOutDaysForVariant, eachDayIso, sumStockOutDays, type LedgerDelta } from "./stock-out-days";

function delta(dayIso: string, availableDelta: number, reservedDelta = 0): LedgerDelta {
  return { createdAt: new Date(`${dayIso}T12:00:00`), quantityAvailableDelta: availableDelta, quantityReservedDelta: reservedDelta };
}

describe("eachDayIso", () => {
  it("inclusive of both ends", () => {
    expect(eachDayIso("2026-09-01", "2026-09-03")).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
  });
  it("same day = one day", () => {
    expect(eachDayIso("2026-09-01", "2026-09-01")).toEqual(["2026-09-01"]);
  });
});

describe("countStockOutDaysForVariant (backlog 7.5 — ledger-accurate stock-out days)", () => {
  // A SKU that went to 0 for 3 days (09-04..09-06) then restocked on 09-07.
  // currentSellable = 10 (today, after the restock). Ledger: -10 sold on 09-04 (0..09-06
  // balance was 0), +10 restock on 09-07.
  it("a SKU out of stock for exactly 3 days, then restocked, counts 3", () => {
    const entries: LedgerDelta[] = [delta("2026-09-04", -10), delta("2026-09-07", 10)];
    const count = countStockOutDaysForVariant({ variantId: "v1", currentSellable: 10, entries }, "2026-09-01", "2026-09-08");
    expect(count).toBe(3); // 09-04, 09-05, 09-06
  });

  it("a SKU that never went out (steady positive balance) counts 0", () => {
    const entries: LedgerDelta[] = [delta("2026-09-02", -2), delta("2026-09-05", -3)];
    // currentSellable = 20 -> even after undoing both entries, balance never drops <= 0.
    const count = countStockOutDaysForVariant({ variantId: "v2", currentSellable: 20, entries }, "2026-09-01", "2026-09-08");
    expect(count).toBe(0);
  });

  it("a SKU out of stock for the entire period counts every day in it", () => {
    // currentSellable = 0, no entries in range -> balance is 0 (<=0) every day.
    const count = countStockOutDaysForVariant({ variantId: "v3", currentSellable: 0, entries: [] }, "2026-09-01", "2026-09-05");
    expect(count).toBe(5);
  });

  it("period edges: an entry landing exactly on the period's last day still counts that day", () => {
    // currentSellable = 0; a -5 sale on the very last day of the period means the balance
    // at that day's own close was already <= 0 (it undoes to -(-5)=+5? no — walking
    // backwards past this day's close removes it, so the day *itself* keeps the post-entry
    // balance, which is currentSellable = 0).
    const entries: LedgerDelta[] = [delta("2026-09-05", -5)];
    const count = countStockOutDaysForVariant({ variantId: "v4", currentSellable: 0, entries }, "2026-09-05", "2026-09-05");
    expect(count).toBe(1);
  });

  it("period edges: restock lands exactly on the period's first day, day is not out", () => {
    // currentSellable = 5; a +5 restock earlier that same day means undoing it (since the
    // restock is at/after this very day's close) gives balance 0 at day's end before the
    // restock... but the restock itself happened within the day, so the day's *close*
    // balance already includes it: 5 (not out).
    const entries: LedgerDelta[] = [delta("2026-09-01", 5)];
    const count = countStockOutDaysForVariant({ variantId: "v5", currentSellable: 5, entries }, "2026-09-01", "2026-09-01");
    expect(count).toBe(0);
  });
});

describe("sumStockOutDays", () => {
  it("sums across every SKU", () => {
    const rows = [
      { variantId: "a", currentSellable: 0, entries: [] },
      { variantId: "b", currentSellable: 100, entries: [] },
    ];
    expect(sumStockOutDays(rows, "2026-09-01", "2026-09-03")).toBe(3); // a: 3 out days, b: 0
  });
});
