import { describe, expect, it } from "vitest";
import { computeFillRatePct } from "./partner-network-report";

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
