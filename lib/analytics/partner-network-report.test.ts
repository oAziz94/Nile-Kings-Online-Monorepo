import { describe, expect, it } from "vitest";
import { computeFillRatePct } from "./partner-network-report";
import { attachPreviousAndDelta } from "./partner-reports";

describe("computeFillRatePct — requested units on FULFILLED / requested units on non-CANCELLED", () => {
  it("matches the 5.5 hand-checked example: 4/(4+6)=40%", () => {
    const requests = [
      { status: "FULFILLED", items: [{ quantity: 4 }] },
      { status: "PENDING", items: [{ quantity: 6 }] },
    ];
    expect(computeFillRatePct(requests)).toBeCloseTo(40, 5);
  });

  it("CANCELLED requests are excluded from the denominator entirely", () => {
    const requests = [
      { status: "FULFILLED", items: [{ quantity: 2 }] },
      { status: "CANCELLED", items: [{ quantity: 100 }] },
    ];
    expect(computeFillRatePct(requests)).toBeCloseTo(100, 5);
  });

  it("no eligible requests -> null, not zero", () => {
    expect(computeFillRatePct([])).toBeNull();
    expect(computeFillRatePct([{ status: "CANCELLED", items: [{ quantity: 5 }] }])).toBeNull();
  });

  it("multiple items per request sum correctly", () => {
    const requests = [{ status: "FULFILLED", items: [{ quantity: 3 }, { quantity: 2 }] }];
    expect(computeFillRatePct(requests)).toBeCloseTo(100, 5);
  });
});

describe("7.4 — distributor rows gain previousSalesPiastres + salesDelta", () => {
  it("a distributor sold in both periods gets a hand-computed delta; one only in the current period compares against 0", () => {
    const currentRows = [
      { partnerId: "dist-a", name: "الموزع أ", salesPiastres: 40_000 },
      { partnerId: "dist-b", name: "الموزع ب", salesPiastres: 15_000 },
    ];
    // dist-a: 40,000 now vs. 10,000 previously -> up, +300%. dist-b: no previous-period row.
    const previousByKey = new Map([["dist-a", 10_000]]);
    const rows = attachPreviousAndDelta(currentRows, (r) => r.partnerId, (r) => r.salesPiastres, previousByKey, {
      previousKey: "previousSalesPiastres",
      deltaKey: "salesDelta",
    });

    const a = rows.find((r) => r.partnerId === "dist-a")!;
    expect(a.previousSalesPiastres).toBe(10_000);
    expect(a.salesDelta).toEqual({ direction: "up", changeAbs: 30_000, changePct: 300 });

    const b = rows.find((r) => r.partnerId === "dist-b")!;
    expect(b.previousSalesPiastres).toBe(0);
    expect(b.salesDelta.changePct).toBeNull();
  });
});
