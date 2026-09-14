import { describe, expect, it } from "vitest";
import { computeRoutingModePill, computeSharePercent } from "./mode-pill";

describe("computeRoutingModePill", () => {
  it("inactive rule is always danger, regardless of partner count", () => {
    expect(computeRoutingModePill(0, false)).toBe("danger");
    expect(computeRoutingModePill(1, false)).toBe("danger");
    expect(computeRoutingModePill(3, false)).toBe("danger");
  });

  it("active rule with zero active partners is danger", () => {
    expect(computeRoutingModePill(0, true)).toBe("danger");
  });

  it("active rule with exactly one active partner is single", () => {
    expect(computeRoutingModePill(1, true)).toBe("single");
  });

  it("active rule with two or more active partners is auto", () => {
    expect(computeRoutingModePill(2, true)).toBe("auto");
    expect(computeRoutingModePill(5, true)).toBe("auto");
  });
});

describe("computeSharePercent", () => {
  it("0 with a zero total (never NaN/divide-by-zero)", () => {
    expect(computeSharePercent(0, 0)).toBe(0);
    expect(computeSharePercent(5, 0)).toBe(0);
  });

  it("rounds to the nearest integer percentage", () => {
    expect(computeSharePercent(1, 3)).toBe(33);
    expect(computeSharePercent(2, 3)).toBe(67);
    expect(computeSharePercent(10, 10)).toBe(100);
  });
});
