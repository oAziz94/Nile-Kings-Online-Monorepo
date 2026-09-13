import { describe, expect, it } from "vitest";
import { buildStatementCsv, computeBalance, computeMarginEstimate } from "./partner-money-report";

describe("computeBalance", () => {
  it("received minus paid; positive means the partner still owes the factory", () => {
    expect(computeBalance(96_400_00, 60_000_00)).toBe(36_400_00);
  });

  it("a rate change after a receipt does not change that receipt's cost — balance only ever sums already-snapshotted totalCostPiastres values, never recomputes them", () => {
    // Simulated: two receipts snapshotted at different rates (7500bps then 7200bps); the
    // caller sums their already-fixed totalCostPiastres — this function never looks at a
    // rate at all, which is the point (rates are read at receipt-apply time, not here).
    const receivedFromTwoDifferentRateSnapshots = 10_000_00 + 9_600_00; // 100 units * 1000 @ 75%, then @ 72%... already applied
    expect(computeBalance(receivedFromTwoDifferentRateSnapshots, 5_000_00)).toBe(14_600_00);
  });

  it("fully paid off -> zero balance", () => {
    expect(computeBalance(50_000_00, 50_000_00)).toBe(0);
  });

  it("overpaid -> negative balance (the factory owes the partner, or an early payment)", () => {
    expect(computeBalance(10_000_00, 12_000_00)).toBe(-2_000_00);
  });
});

describe("computeMarginEstimate", () => {
  it("(1 - costRate) * net merchandise, rounded", () => {
    // costRateBps 7500 (75%) -> partner keeps 25% of 40,000 = 10,000
    expect(computeMarginEstimate(7500, 40_000_00)).toBe(10_000_00);
  });

  it("a lower cost rate (partner buys cheaper) yields a bigger margin on the same merchandise", () => {
    const marginAt75 = computeMarginEstimate(7500, 40_000_00);
    const marginAt72 = computeMarginEstimate(7200, 40_000_00);
    expect(marginAt72).toBeGreaterThan(marginAt75);
  });

  it("rounds to the nearest piastre", () => {
    // (1 - 0.72) * 10001 = 2800.28 -> 2800
    expect(computeMarginEstimate(7200, 10_001)).toBe(2800);
  });

  it("zero merchandise -> zero margin", () => {
    expect(computeMarginEstimate(7500, 0)).toBe(0);
  });
});

describe("buildStatementCsv", () => {
  it("includes every receipt and payment row, tagged by type", () => {
    const csv = buildStatementCsv(
      [{ id: "r1", reference: "FR-0001", createdAt: "2026-09-01T00:00:00.000Z", units: 100, totalCostPiastres: 500_00 }],
      [{ id: "p1", kind: "DOWN_PAYMENT", amountPiastres: 200_00, paidAt: "2026-09-02T00:00:00.000Z", reference: null, stockReceiptId: "r1", stockReceiptReference: "FR-0001" }]
    );
    expect(csv).toContain("FR-0001");
    expect(csv).toContain("Receipt");
    expect(csv).toContain("Down payment");
    expect(csv).toContain("50000"); // receipt amount in piastres
    expect(csv).toContain("20000"); // payment amount in piastres
  });
});
