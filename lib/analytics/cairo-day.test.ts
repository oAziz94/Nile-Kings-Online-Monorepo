import { describe, expect, it } from "vitest";
import {
  addDaysIsoUtc,
  cairoDateIso,
  cairoEndOfDayUtc,
  cairoYesterdayIso,
  dayIsoToDate,
  daysBetweenIso,
  isSnapshotWithinLookback,
  pickNearestSnapshotDay,
} from "./cairo-day";

describe("cairoDateIso / cairoYesterdayIso (backlog 7.5 — the cron's 'yesterday in Africa/Cairo')", () => {
  // September falls in Egypt's seasonal DST window (reinstated 2023): UTC+3, not the older
  // fixed UTC+2 the backlog line's own schedule comment assumed — verified against Node's
  // ICU tzdata directly, not hand-derived, so this test would fail loudly if that ever
  // changes rather than silently assuming either offset.
  it("a UTC instant just after Cairo midnight (UTC+3 in September) reads as the new Cairo day", () => {
    // 2026-09-13T21:05:00Z = 2026-09-14T00:05 Cairo.
    expect(cairoDateIso(new Date("2026-09-13T21:05:00.000Z"))).toBe("2026-09-14");
  });

  it("a UTC instant just before Cairo midnight still reads as the old Cairo day", () => {
    // 2026-09-13T20:55:00Z = 2026-09-13T23:55 Cairo.
    expect(cairoDateIso(new Date("2026-09-13T20:55:00.000Z"))).toBe("2026-09-13");
  });

  it("cairoYesterdayIso is exactly one calendar day before cairoDateIso(now)", () => {
    const now = new Date("2026-09-13T21:05:00.000Z"); // Cairo day 09-14
    expect(cairoYesterdayIso(now)).toBe("2026-09-13");
  });

  it("a winter date (Egypt back on UTC+2) round-trips correctly too", () => {
    expect(cairoDateIso(new Date("2026-01-13T21:55:00.000Z"))).toBe("2026-01-13"); // 23:55 Cairo, still the 13th
    expect(cairoDateIso(new Date("2026-01-13T22:05:00.000Z"))).toBe("2026-01-14"); // 00:05 Cairo, the 14th
  });
});

describe("addDaysIsoUtc", () => {
  it("adds/subtracts across a month boundary", () => {
    expect(addDaysIsoUtc("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDaysIsoUtc("2026-08-31", 1)).toBe("2026-09-01");
  });
});

describe("dayIsoToDate / cairoEndOfDayUtc", () => {
  it("dayIsoToDate is UTC midnight of that calendar day", () => {
    expect(dayIsoToDate("2026-09-13").toISOString()).toBe("2026-09-13T00:00:00.000Z");
  });

  it("cairoEndOfDayUtc is 20:59:59.999Z in September (23:59:59.999 Cairo, UTC+3 DST)", () => {
    expect(cairoEndOfDayUtc("2026-09-13").toISOString()).toBe("2026-09-13T20:59:59.999Z");
  });

  it("cairoEndOfDayUtc is 21:59:59.999Z in January (23:59:59.999 Cairo, UTC+2 winter)", () => {
    expect(cairoEndOfDayUtc("2026-01-13").toISOString()).toBe("2026-01-13T21:59:59.999Z");
  });
});

describe("daysBetweenIso / isSnapshotWithinLookback / pickNearestSnapshotDay (nearest-snapshot lookup)", () => {
  const target = "2026-09-13";

  it("exact day: 0 days before, within lookback", () => {
    expect(daysBetweenIso(target, target)).toBe(0);
    expect(isSnapshotWithinLookback(target, target)).toBe(true);
  });

  it("3 days before: within the default 7-day lookback", () => {
    const candidate = "2026-09-10";
    expect(daysBetweenIso(candidate, target)).toBe(3);
    expect(isSnapshotWithinLookback(candidate, target)).toBe(true);
  });

  it("8 days before: outside the default 7-day lookback -> none", () => {
    const candidate = "2026-09-05";
    expect(daysBetweenIso(candidate, target)).toBe(8);
    expect(isSnapshotWithinLookback(candidate, target)).toBe(false);
  });

  it("a candidate after the target is never usable", () => {
    expect(isSnapshotWithinLookback("2026-09-14", target)).toBe(false);
  });

  it("pickNearestSnapshotDay returns the latest qualifying day, not just any", () => {
    expect(pickNearestSnapshotDay(["2026-09-10", "2026-09-08", "2026-09-13"], target)).toBe("2026-09-13");
  });

  it("pickNearestSnapshotDay returns null when every candidate is outside the lookback", () => {
    expect(pickNearestSnapshotDay(["2026-09-05", "2026-08-01"], target)).toBeNull();
  });
});
