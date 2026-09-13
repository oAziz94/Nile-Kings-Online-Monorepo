import { describe, expect, it } from "vitest";
import {
  buildCapacityMeter,
  buildTrendSeries,
  isOrderOverdue,
  resolveStatusEnteredAt,
  resolveWeekRanges,
} from "./today";

describe("resolveWeekRanges", () => {
  it("starts the week on the most recent Saturday", () => {
    // 2026-09-13 is a Sunday (JS Date's own calendar).
    const now = new Date(2026, 8, 13, 15, 0, 0);
    const { thisWeek, lastWeek } = resolveWeekRanges(now);
    expect(thisWeek.start.getDay()).toBe(6); // Saturday
    expect(thisWeek.start.toDateString()).toBe(new Date(2026, 8, 12).toDateString());
    expect(thisWeek.end).toBe(now);
    expect(lastWeek.start.toDateString()).toBe(new Date(2026, 8, 5).toDateString());
    expect(lastWeek.end.toDateString()).toBe(thisWeek.start.toDateString());
  });

  it("a Saturday itself is the start of its own week", () => {
    const now = new Date(2026, 8, 12, 9, 0, 0); // Saturday
    const { thisWeek } = resolveWeekRanges(now);
    expect(thisWeek.start.toDateString()).toBe(new Date(2026, 8, 12).toDateString());
  });
});

describe("resolveStatusEnteredAt", () => {
  it("prefers the audit log timestamp", () => {
    const updatedAt = new Date("2026-09-01T00:00:00Z");
    const latestStatusLogAt = new Date("2026-09-05T00:00:00Z");
    expect(resolveStatusEnteredAt({ updatedAt, latestStatusLogAt })).toBe(latestStatusLogAt);
  });

  it("falls back to updatedAt when there is no audit row", () => {
    const updatedAt = new Date("2026-09-01T00:00:00Z");
    expect(resolveStatusEnteredAt({ updatedAt, latestStatusLogAt: null })).toBe(updatedAt);
  });
});

describe("isOrderOverdue", () => {
  const now = new Date("2026-09-13T12:00:00Z");

  it("a CONFIRMED order uses confirmSlaHours", () => {
    const enteredAt = new Date("2026-09-13T00:00:00Z"); // 12h ago
    const sla = { confirmSlaHours: 24, shipSlaHours: 48 };
    expect(isOrderOverdue({ status: "CONFIRMED", updatedAt: enteredAt, latestStatusLogAt: null }, sla, now)).toBe(false);
    expect(
      isOrderOverdue({ status: "CONFIRMED", updatedAt: enteredAt, latestStatusLogAt: null }, { ...sla, confirmSlaHours: 6 }, now)
    ).toBe(true);
  });

  it("a PROCESSING order uses shipSlaHours", () => {
    const enteredAt = new Date("2026-09-11T12:00:00Z"); // 48h ago
    const sla = { confirmSlaHours: 24, shipSlaHours: 48 };
    expect(isOrderOverdue({ status: "PROCESSING", updatedAt: enteredAt, latestStatusLogAt: null }, sla, now)).toBe(false);
    expect(
      isOrderOverdue({ status: "PROCESSING", updatedAt: enteredAt, latestStatusLogAt: null }, { ...sla, shipSlaHours: 40 }, now)
    ).toBe(true);
  });

  it("a changed SLA immediately changes the overdue verdict for the same order", () => {
    const enteredAt = new Date("2026-09-13T00:00:00Z"); // 12h ago
    const row = { status: "CONFIRMED" as const, updatedAt: enteredAt, latestStatusLogAt: null };
    expect(isOrderOverdue(row, { confirmSlaHours: 10, shipSlaHours: 48 }, now)).toBe(true);
    expect(isOrderOverdue(row, { confirmSlaHours: 13, shipSlaHours: 48 }, now)).toBe(false);
  });
});

describe("buildCapacityMeter", () => {
  it("hides (null remaining) when capacity is null", () => {
    expect(buildCapacityMeter(null, 5)).toEqual({ used: 5, capacity: null, remaining: null });
  });

  it("computes remaining, clamped at zero", () => {
    expect(buildCapacityMeter(40, 14)).toEqual({ used: 14, capacity: 40, remaining: 26 });
    expect(buildCapacityMeter(10, 15)).toEqual({ used: 15, capacity: 10, remaining: 0 });
  });
});

describe("buildTrendSeries", () => {
  it("zero-fills days with no orders and keeps a continuous window ending at endDate", () => {
    const end = new Date("2026-09-13T18:00:00Z");
    const buckets = [
      { period: "2026-09-11", netMerchandisePiastres: 10000, orderCount: 2 },
      { period: "2026-09-13", netMerchandisePiastres: 5000, orderCount: 1 },
    ];
    const series = buildTrendSeries(buckets, 3, end);
    expect(series.map((p) => p.date)).toEqual(["2026-09-11", "2026-09-12", "2026-09-13"]);
    expect(series[0]).toEqual({ date: "2026-09-11", revenuePiastres: 10000, orderCount: 2 });
    expect(series[1]).toEqual({ date: "2026-09-12", revenuePiastres: 0, orderCount: 0 });
    expect(series[2]).toEqual({ date: "2026-09-13", revenuePiastres: 5000, orderCount: 1 });
  });
});
