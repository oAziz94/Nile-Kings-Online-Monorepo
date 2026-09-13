import { describe, expect, it } from "vitest";
import { computeCoverDays, formatCoverDays, COVER_DAYS_CAP } from "./stock-cover";

describe("computeCoverDays", () => {
  it("returns null (displayed as —) with zero velocity", () => {
    expect(computeCoverDays(40, 0)).toBeNull();
    expect(formatCoverDays(computeCoverDays(40, 0))).toBe("—");
  });

  it("computes sellable ÷ (unitsSold / 30)", () => {
    // 60 units sold in 30 days -> velocity 2/day; sellable 20 -> 10 days of cover.
    expect(computeCoverDays(20, 60)).toBe(10);
  });

  it("caps the display at 120+", () => {
    // 1 unit sold in 30 days -> velocity 1/30/day; sellable 1000 -> far past the cap.
    const days = computeCoverDays(1000, 1);
    expect(days).toBe(COVER_DAYS_CAP);
    expect(formatCoverDays(days)).toBe("120+");
  });

  it("rounds to the nearest whole day below the cap", () => {
    // 10 units sold in 30 days -> velocity 1/3 per day; sellable 4 -> 12 days exactly.
    expect(computeCoverDays(4, 10)).toBe(12);
  });

  it("handles zero sellable with positive velocity as zero days of cover", () => {
    expect(computeCoverDays(0, 30)).toBe(0);
    expect(formatCoverDays(0)).toBe("0");
  });
});
