import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Backlog 9.10 — `getNetworkStockRows`'s 60-second in-memory cache, keyed by the latest
 * `InventoryLedger.id`. Rather than exercise the full `computeInventoryRows`/
 * `resolveThreshold` machinery (already covered elsewhere), this test only cares about *how
 * many times* the expensive per-partner work runs — `prisma.partner.findMany` is a fair
 * proxy for that, since `computeNetworkStockRows` always calls it first.
 */

let ledgerRows: { id: string }[] = [{ id: "ledger-1" }];
let partnerFindManyCalls = 0;

vi.mock("@/lib/db", () => ({
  get prisma() {
    return {
      inventoryLedger: {
        findFirst: async () => ledgerRows[ledgerRows.length - 1] ?? null,
      },
      partner: {
        findMany: async () => {
          partnerFindManyCalls += 1;
          return [];
        },
      },
    };
  },
}));

vi.mock("./partner-inventory-report", () => ({
  computeInventoryRows: async () => ({ rows: [], partner: { deadStockDays: 60, targetCoverDays: 21 }, costRateBps: 0 }),
}));
vi.mock("./partner-reports", () => ({
  resolvePeriod: () => ({ preset: "30d", days: 30, current: { from: "2026-01-01", to: "2026-01-30" }, previous: { from: "2025-12-02", to: "2025-12-31" } }),
}));
vi.mock("@/lib/partner/resolve-threshold", () => ({
  resolveThreshold: async () => ({ forVariant: () => 5 }),
}));

const { getNetworkStockRows, _resetNetworkStockCacheForTests } = await import("./network-stock");

beforeEach(() => {
  ledgerRows = [{ id: "ledger-1" }];
  partnerFindManyCalls = 0;
  _resetNetworkStockCacheForTests();
});

describe("getNetworkStockRows cache", () => {
  it("reuses the cached result when the latest InventoryLedger id hasn't changed", async () => {
    await getNetworkStockRows();
    await getNetworkStockRows();
    await getNetworkStockRows();
    expect(partnerFindManyCalls).toBe(1);
  });

  it("recomputes once a new InventoryLedger row changes the latest id", async () => {
    await getNetworkStockRows();
    expect(partnerFindManyCalls).toBe(1);

    ledgerRows.push({ id: "ledger-2" }); // a stock-affecting write appended a new ledger row
    await getNetworkStockRows();
    expect(partnerFindManyCalls).toBe(2);

    // Same key again -> cached, no third compute.
    await getNetworkStockRows();
    expect(partnerFindManyCalls).toBe(2);
  });

  it("recomputes after the 60s TTL even with the same ledger id", async () => {
    vi.useFakeTimers();
    try {
      await getNetworkStockRows();
      expect(partnerFindManyCalls).toBe(1);

      vi.advanceTimersByTime(61_000);
      await getNetworkStockRows();
      expect(partnerFindManyCalls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
