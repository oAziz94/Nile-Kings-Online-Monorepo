import { describe, expect, it } from "vitest";
import { aggregatePartnerStockTotals, type StockTotalsInventoryRow } from "./partner-stock-totals";

const AT = new Date("2026-09-13T21:59:59.999Z");

describe("aggregatePartnerStockTotals (backlog 7.5 — shared by the inventory report's headline tiles and the daily snapshot cron)", () => {
  it("matches a hand computation across a small mixed inventory", () => {
    const inventories: StockTotalsInventoryRow[] = [
      // sellable 5 (20 - 15), price 10000, costRateBps 7500 -> unitCost 7500
      { variantId: "v1", stockAvailable: 20, stockReserved: 15, pricePiastres: 10000 },
      // sellable 0 (out of stock)
      { variantId: "v2", stockAvailable: 3, stockReserved: 3, pricePiastres: 5000 },
      // sellable -2 (oversold), also counts as out of stock
      { variantId: "v3", stockAvailable: 1, stockReserved: 3, pricePiastres: 2000 },
    ];
    const costRateBps = 7500;
    const deadStockDays = 60;
    const velocityPerDayByVariant = new Map([["v1", 2]]); // v2/v3 unmeasured
    const lastSaleByVariant = new Map([
      ["v1", new Date("2026-09-10T00:00:00Z")], // 3 days before AT -> not dead
      ["v2", new Date("2026-01-01T00:00:00Z")], // long ago -> dead
      // v3 never sold -> dead (no lastSale entry)
    ]);

    const totals = aggregatePartnerStockTotals(inventories, costRateBps, deadStockDays, velocityPerDayByVariant, lastSaleByVariant, AT);

    expect(totals.sellableUnits).toBe(5 + 0 + -2); // 3
    expect(totals.reservedUnits).toBe(15 + 3 + 3); // 21
    // valuationCost = sellable * round(price * bps / 10000)
    // v1: 5 * round(10000*7500/10000)=5*7500=37500; v2: 0*3750=0; v3: -2*1500=-3000
    expect(totals.valuationCostPiastres).toBe(37500 + 0 - 3000);
    // valuationPrice = sellable * price: v1 5*10000=50000; v2 0; v3 -2*2000=-4000
    expect(totals.valuationPricePiastres).toBe(50000 + 0 - 4000);
    expect(totals.outOfStockSkus).toBe(2); // v2 (0), v3 (-2)
    expect(totals.deadStockSkus).toBe(2); // v2, v3
    // coverDays: only v1 has velocity -> median([5/2]) = 2.5
    expect(totals.coverDays).toBeCloseTo(2.5, 5);
  });

  it("empty inventory returns all-zero totals and null coverDays (not zero, not Infinity)", () => {
    const totals = aggregatePartnerStockTotals([], 7500, 60, new Map(), new Map(), AT);
    expect(totals).toEqual({
      sellableUnits: 0,
      reservedUnits: 0,
      valuationCostPiastres: 0,
      valuationPricePiastres: 0,
      coverDays: null,
      deadStockSkus: 0,
      outOfStockSkus: 0,
    });
  });

  it("a variant with zero velocity never contributes to the coverDays median", () => {
    const inventories: StockTotalsInventoryRow[] = [
      { variantId: "v1", stockAvailable: 10, stockReserved: 0, pricePiastres: 1000 },
    ];
    const totals = aggregatePartnerStockTotals(inventories, 7500, 60, new Map(), new Map(), AT);
    expect(totals.coverDays).toBeNull();
  });

  it("dead-stock boundary: exactly deadStockDays since last sale counts as dead (>=, not >)", () => {
    const exactlySixty = new Date(AT.getTime() - 60 * 86_400_000);
    const inventories: StockTotalsInventoryRow[] = [{ variantId: "v1", stockAvailable: 5, stockReserved: 0, pricePiastres: 1000 }];
    const totals = aggregatePartnerStockTotals(
      inventories,
      7500,
      60,
      new Map(),
      new Map([["v1", exactlySixty]]),
      AT
    );
    expect(totals.deadStockSkus).toBe(1);
  });
});
