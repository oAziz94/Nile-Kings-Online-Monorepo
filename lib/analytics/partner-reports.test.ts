import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  computeDelta,
  daysOfCoverForVelocity,
  daySpanInclusive,
  median,
  resolvePeriod,
  suggestedReorderQty,
} from "./partner-reports";

describe("resolvePeriod", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 13)); // 2026-09-13
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("today: current = [today, today], previous = [yesterday, yesterday]", () => {
    const p = resolvePeriod({ preset: "today" });
    expect(p.current).toEqual({ from: "2026-09-13", to: "2026-09-13" });
    expect(p.previous).toEqual({ from: "2026-09-12", to: "2026-09-12" });
    expect(p.days).toBe(1);
  });

  it("7d: a 7-day current period compares to the immediately preceding 7-day period", () => {
    const p = resolvePeriod({ preset: "7d" });
    expect(p.current).toEqual({ from: "2026-09-07", to: "2026-09-13" });
    expect(p.days).toBe(7);
    expect(p.previous).toEqual({ from: "2026-08-31", to: "2026-09-06" });
  });

  it("30d: previous is the prior 30-day window, non-overlapping", () => {
    const p = resolvePeriod({ preset: "30d" });
    expect(p.current).toEqual({ from: "2026-08-15", to: "2026-09-13" });
    expect(p.days).toBe(30);
    expect(p.previous).toEqual({ from: "2026-07-16", to: "2026-08-14" });
  });

  it("month: from the 1st of the current month to today", () => {
    const p = resolvePeriod({ preset: "month" });
    expect(p.current).toEqual({ from: "2026-09-01", to: "2026-09-13" });
  });

  it("lastMonth: the whole previous calendar month, compared to the month before that", () => {
    const p = resolvePeriod({ preset: "lastMonth" });
    expect(p.current).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(p.previous).toEqual({ from: "2026-07-01", to: "2026-07-31" });
  });

  it("custom: uses the given from/to and clamps a future `to` to today", () => {
    const p = resolvePeriod({ preset: "custom", from: "2026-09-01", to: "2026-12-31" });
    expect(p.current).toEqual({ from: "2026-09-01", to: "2026-09-13" });
  });

  it("custom: throws without from/to", () => {
    expect(() => resolvePeriod({ preset: "custom" })).toThrow();
  });

  it("allTime: current spans the anchor date through today (backlog 5.6b's Money report)", () => {
    const p = resolvePeriod({ preset: "allTime" });
    expect(p.current).toEqual({ from: "2020-01-01", to: "2026-09-13" });
  });
});

describe("median (backlog 5.6b: fulfilment timing medians)", () => {
  it("odd count: the middle value", () => {
    expect(median([5, 1, 3])).toBe(3);
  });
  it("even count: the average of the two middle values", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("empty input: null, not zero", () => {
    expect(median([])).toBeNull();
  });
  it("single value: itself", () => {
    expect(median([42])).toBe(42);
  });
});

describe("daySpanInclusive", () => {
  it("same day = 1", () => {
    expect(daySpanInclusive("2026-09-13", "2026-09-13")).toBe(1);
  });
  it("counts both endpoints", () => {
    expect(daySpanInclusive("2026-09-07", "2026-09-13")).toBe(7);
  });
});

describe("computeDelta", () => {
  it("up: current > previous", () => {
    const d = computeDelta(120, 100);
    expect(d.direction).toBe("up");
    expect(d.changeAbs).toBe(20);
    expect(d.changePct).toBe(20);
  });

  it("down: current < previous", () => {
    const d = computeDelta(80, 100);
    expect(d.direction).toBe("down");
    expect(d.changePct).toBe(-20);
  });

  it("flat: current === previous (including both zero)", () => {
    expect(computeDelta(50, 50).direction).toBe("flat");
    expect(computeDelta(0, 0)).toEqual({ direction: "flat", changeAbs: 0, changePct: 0 });
  });

  it("previous is 0 and current isn't: changePct is null (undefined %), direction is still up", () => {
    const d = computeDelta(10, 0);
    expect(d.direction).toBe("up");
    expect(d.changePct).toBeNull();
    expect(d.changeAbs).toBe(10);
  });
});

describe("suggestedReorderQty (targetCoverDays * velocityPerDay - sellable, ceil, floored at 0)", () => {
  it("matches the formula exactly", () => {
    // 21 * 2.5 - 10 = 52.5 - 10 = 42.5 -> ceil 43
    expect(suggestedReorderQty(21, 2.5, 10)).toBe(43);
  });

  it("never goes negative when sellable already covers the target", () => {
    expect(suggestedReorderQty(21, 0.1, 100)).toBe(0);
  });

  it("zero velocity never suggests a reorder", () => {
    expect(suggestedReorderQty(21, 0, 5)).toBe(0);
  });
});

describe("daysOfCoverForVelocity", () => {
  it("sellable / velocityPerDay", () => {
    expect(daysOfCoverForVelocity(30, 3)).toBe(10);
  });
  it("null with no velocity (avoids a division by zero reading as Infinity)", () => {
    expect(daysOfCoverForVelocity(30, 0)).toBeNull();
  });
});
