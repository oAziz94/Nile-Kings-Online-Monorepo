import { describe, expect, it } from "vitest";
import { computeStockRowMetrics, netMerchandisePiastres } from "./queries";

describe("computeStockRowMetrics (backlog 4.22 partner stock report)", () => {
  it("marks a row out when sellable is zero, never low", () => {
    const result = computeStockRowMetrics({
      stockAvailable: 3,
      stockReserved: 3,
      unitsSold30d: 15,
      threshold: 5,
    });
    expect(result.sellable).toBe(0);
    expect(result.out).toBe(true);
    expect(result.low).toBe(false);
  });

  it("marks a row out when sellable is negative (over-reserved)", () => {
    const result = computeStockRowMetrics({
      stockAvailable: 2,
      stockReserved: 5,
      unitsSold30d: 0,
      threshold: 5,
    });
    expect(result.sellable).toBe(-3);
    expect(result.out).toBe(true);
    expect(result.low).toBe(false);
  });

  it("marks a row low when sellable is positive but at/below the partner threshold", () => {
    const result = computeStockRowMetrics({
      stockAvailable: 10,
      stockReserved: 5,
      unitsSold30d: 30,
      threshold: 5,
    });
    expect(result.sellable).toBe(5);
    expect(result.low).toBe(true);
    expect(result.out).toBe(false);
  });

  it("marks a row neither low nor out above the threshold", () => {
    const result = computeStockRowMetrics({
      stockAvailable: 50,
      stockReserved: 0,
      unitsSold30d: 0,
      threshold: 5,
    });
    expect(result.low).toBe(false);
    expect(result.out).toBe(false);
  });

  it("computes daily velocity as units sold over a fixed 30-day window", () => {
    const result = computeStockRowMetrics({
      stockAvailable: 100,
      stockReserved: 0,
      unitsSold30d: 60,
      threshold: 5,
    });
    expect(result.dailyVelocity).toBe(2);
  });

  it("computes days of cover as sellable / velocity", () => {
    const result = computeStockRowMetrics({
      stockAvailable: 100,
      stockReserved: 0,
      unitsSold30d: 60,
      threshold: 5,
    });
    expect(result.daysOfCover).toBe(50);
  });

  it("returns null days of cover when velocity is zero (no sales in the window)", () => {
    const result = computeStockRowMetrics({
      stockAvailable: 100,
      stockReserved: 0,
      unitsSold30d: 0,
      threshold: 5,
    });
    expect(result.dailyVelocity).toBe(0);
    expect(result.daysOfCover).toBeNull();
  });
});

describe("netMerchandisePiastres (shared by the revenue/stock/funnel reports)", () => {
  it("subtracts discount and senior-free value from subtotal", () => {
    expect(
      netMerchandisePiastres({
        subtotalPiastres: 10000,
        discountPiastres: 1000,
        seniorFreeValuePiastres: 500,
      })
    ).toBe(8500);
  });
});
