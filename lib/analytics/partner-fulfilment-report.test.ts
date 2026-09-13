import { describe, expect, it } from "vitest";
import { computeFulfilmentStats, computeOrderTimings } from "./partner-fulfilment-report";
import { attachPreviousAndDelta } from "./partner-reports";

function hoursLater(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 3_600_000);
}

describe("computeOrderTimings", () => {
  const base = new Date("2026-09-01T00:00:00.000Z");

  it("hours to confirm = first CONFIRMED row minus the order's own createdAt", () => {
    const orders = [{ id: "o1", createdAt: base, updatedAt: base, status: "CONFIRMED", cancellationReason: null }];
    const auditRows = [{ orderId: "o1", statusTo: "CONFIRMED", createdAt: hoursLater(base, 5) }];
    const timings = computeOrderTimings(orders, auditRows);
    expect(timings[0].hoursToConfirm).toBeCloseTo(5, 5);
    expect(timings[0].hoursToShip).toBeNull();
    expect(timings[0].hasAuditTrail).toBe(true);
  });

  it("hours to ship = first SHIPPED row minus the first CONFIRMED row", () => {
    const orders = [{ id: "o1", createdAt: base, updatedAt: base, status: "SHIPPED", cancellationReason: null }];
    const auditRows = [
      { orderId: "o1", statusTo: "CONFIRMED", createdAt: hoursLater(base, 2) },
      { orderId: "o1", statusTo: "PROCESSING", createdAt: hoursLater(base, 3) },
      { orderId: "o1", statusTo: "SHIPPED", createdAt: hoursLater(base, 10) },
    ];
    const timings = computeOrderTimings(orders, auditRows);
    expect(timings[0].hoursToConfirm).toBeCloseTo(2, 5);
    expect(timings[0].hoursToShip).toBeCloseTo(8, 5); // 10 - 2
  });

  it("an order with zero audit rows reports both timings null and hasAuditTrail=false", () => {
    const orders = [{ id: "o1", createdAt: base, updatedAt: base, status: "CREATED", cancellationReason: null }];
    const timings = computeOrderTimings(orders, []);
    expect(timings[0].hoursToConfirm).toBeNull();
    expect(timings[0].hoursToShip).toBeNull();
    expect(timings[0].hasAuditTrail).toBe(false);
  });

  it("uses out-of-order audit rows correctly (sorts by createdAt first)", () => {
    const orders = [{ id: "o1", createdAt: base, updatedAt: base, status: "SHIPPED", cancellationReason: null }];
    const auditRows = [
      { orderId: "o1", statusTo: "SHIPPED", createdAt: hoursLater(base, 10) },
      { orderId: "o1", statusTo: "CONFIRMED", createdAt: hoursLater(base, 2) },
    ];
    const timings = computeOrderTimings(orders, auditRows);
    expect(timings[0].hoursToConfirm).toBeCloseTo(2, 5);
    expect(timings[0].hoursToShip).toBeCloseTo(8, 5);
  });
});

describe("computeFulfilmentStats — medians and rates", () => {
  const base = new Date("2026-09-01T00:00:00.000Z");
  const sla = { confirmSlaHours: 24, shipSlaHours: 48 };
  const now = hoursLater(base, 100);

  it("median hours to confirm over an odd count of orders", () => {
    const orders = [
      { id: "o1", createdAt: base, updatedAt: base, status: "CONFIRMED", cancellationReason: null },
      { id: "o2", createdAt: base, updatedAt: base, status: "CONFIRMED", cancellationReason: null },
      { id: "o3", createdAt: base, updatedAt: base, status: "CONFIRMED", cancellationReason: null },
    ];
    const auditRows = [
      { orderId: "o1", statusTo: "CONFIRMED", createdAt: hoursLater(base, 2) },
      { orderId: "o2", statusTo: "CONFIRMED", createdAt: hoursLater(base, 6) },
      { orderId: "o3", statusTo: "CONFIRMED", createdAt: hoursLater(base, 100) },
    ];
    const timings = computeOrderTimings(orders, auditRows);
    const stats = computeFulfilmentStats(orders, timings, sla, now);
    expect(stats.medianHoursToConfirm).toBeCloseTo(6, 5); // sorted [2, 6, 100] -> middle is 6
  });

  it("orders with no timing are excluded from the median, not treated as zero", () => {
    const orders = [
      { id: "o1", createdAt: base, updatedAt: base, status: "CONFIRMED", cancellationReason: null },
      { id: "o2", createdAt: base, updatedAt: base, status: "CREATED", cancellationReason: null },
    ];
    const auditRows = [{ orderId: "o1", statusTo: "CONFIRMED", createdAt: hoursLater(base, 4) }];
    const timings = computeOrderTimings(orders, auditRows);
    const stats = computeFulfilmentStats(orders, timings, sla, now);
    expect(stats.medianHoursToConfirm).toBeCloseTo(4, 5);
    expect(stats.noAuditCount).toBe(1); // o2 has zero audit rows
  });

  it("overdue rate: a CONFIRMED order past shipSlaHours since its last audit row is overdue", () => {
    const orders = [
      { id: "o1", createdAt: base, updatedAt: base, status: "CONFIRMED", cancellationReason: null },
      { id: "o2", createdAt: base, updatedAt: base, status: "CONFIRMED", cancellationReason: null },
    ];
    // o1 entered CONFIRMED 30h before "now" (> 24h ship SLA) -> overdue; o2 entered 5h before -> not.
    const auditRows = [
      { orderId: "o1", statusTo: "CONFIRMED", createdAt: hoursLater(now, -30) },
      { orderId: "o2", statusTo: "CONFIRMED", createdAt: hoursLater(now, -5) },
    ];
    const timings = computeOrderTimings(orders, auditRows);
    const stats = computeFulfilmentStats(orders, timings, { ...sla, shipSlaHours: 24 }, now);
    expect(stats.overdueRate).toBeCloseTo(50, 5);
  });

  it("cancellation rate and delivered rate are simple ratios over every order in the period", () => {
    const orders = [
      { id: "o1", createdAt: base, updatedAt: base, status: "DELIVERED", cancellationReason: null },
      { id: "o2", createdAt: base, updatedAt: base, status: "CANCELLED", cancellationReason: "customer" },
      { id: "o3", createdAt: base, updatedAt: base, status: "DELIVERED", cancellationReason: null },
      { id: "o4", createdAt: base, updatedAt: base, status: "PROCESSING", cancellationReason: null },
    ];
    const stats = computeFulfilmentStats(orders, computeOrderTimings(orders, []), sla, now);
    expect(stats.cancellationRate).toBeCloseTo(25, 5);
    expect(stats.deliveredRate).toBeCloseTo(50, 5);
    expect(stats.totalOrders).toBe(4);
  });

  it("zero orders reports 0 for every rate, not NaN", () => {
    const stats = computeFulfilmentStats([], [], sla, now);
    expect(stats.overdueRate).toBe(0);
    expect(stats.cancellationRate).toBe(0);
    expect(stats.deliveredRate).toBe(0);
    expect(stats.medianHoursToConfirm).toBeNull();
  });
});

describe("7.4 — cancellationReason rows gain previousCount + countDelta", () => {
  it("a reason cancelled in both periods gets a hand-computed delta; one only in the current period compares against 0", () => {
    const currentRows = [
      { key: "customer", label: "customer", count: 3 },
      { key: "out_of_stock", label: "out_of_stock", count: 1 },
    ];
    // "customer": 3 now vs. 6 previously -> down, -50%. "out_of_stock": no previous-period row.
    const previousByKey = new Map([["customer", 6]]);
    const rows = attachPreviousAndDelta(currentRows, (r) => r.key, (r) => r.count, previousByKey, {
      previousKey: "previousCount",
      deltaKey: "countDelta",
    });

    const customer = rows.find((r) => r.key === "customer")!;
    expect(customer.previousCount).toBe(6);
    expect(customer.countDelta).toEqual({ direction: "down", changeAbs: -3, changePct: -50 });

    const outOfStock = rows.find((r) => r.key === "out_of_stock")!;
    expect(outOfStock.previousCount).toBe(0);
    expect(outOfStock.countDelta.changePct).toBeNull();
  });
});
