import { describe, expect, it } from "vitest";
import { buildThresholdLookup } from "./resolve-threshold";
import { isWorkingDay, isoDayCodeFor } from "./working-day";

describe("buildThresholdLookup (resolveThreshold's pure core)", () => {
  it("falls back to the partner default when no overrides exist", () => {
    const lookup = buildThresholdLookup(5, []);
    expect(lookup.forVariant({ productId: "p1", categoryId: "c1" })).toBe(5);
  });

  it("a category override beats the default", () => {
    const lookup = buildThresholdLookup(5, [{ categoryId: "c1", productId: null, threshold: 8 }]);
    expect(lookup.forVariant({ productId: "p1", categoryId: "c1" })).toBe(8);
    expect(lookup.forVariant({ productId: "p1", categoryId: "other" })).toBe(5);
  });

  it("a product override beats a category override which beats the default", () => {
    const lookup = buildThresholdLookup(5, [
      { categoryId: "c1", productId: null, threshold: 8 },
      { categoryId: null, productId: "p1", threshold: 12 },
    ]);
    expect(lookup.forVariant({ productId: "p1", categoryId: "c1" })).toBe(12);
    expect(lookup.forVariant({ productId: "other", categoryId: "c1" })).toBe(8);
    expect(lookup.forVariant({ productId: "other", categoryId: "other" })).toBe(5);
  });
});

describe("isWorkingDay", () => {
  it("returns true when the date's ISO day code is in workingDays", () => {
    // 2026-09-13 is a Sunday (JS Date's own calendar — the design canvas's "السبت 13
    // سبتمبر 2026" is placeholder copy, not a real calendar reference).
    const date = new Date(2026, 8, 13, 10, 0, 0);
    expect(isoDayCodeFor(date)).toBe("SUN");
    expect(isWorkingDay({ workingDays: ["SAT", "SUN"] }, date)).toBe(true);
  });

  it("returns false when the date's ISO day code is not in workingDays", () => {
    const date = new Date(2026, 8, 13, 10, 0, 0); // Sunday
    expect(isWorkingDay({ workingDays: ["FRI", "SAT"] }, date)).toBe(false);
  });

  it("treats every day as working when workingDays lists all seven", () => {
    const all = ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"];
    for (let i = 0; i < 7; i++) {
      const date = new Date(2026, 8, 13 + i); // local time, spans a full week
      expect(isWorkingDay({ workingDays: all }, date)).toBe(true);
    }
  });
});
