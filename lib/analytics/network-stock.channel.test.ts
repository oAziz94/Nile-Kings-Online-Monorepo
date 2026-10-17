/** Backlog 11.1 — the admin network stock tab never loads an outlet (DISTRIBUTOR). */
import { describe, it, expect, vi } from "vitest";

const loaded: string[] = [];
const partners = [
  { id: "agent", name: "A", partnerType: "AGENT", isActive: true },
  { id: "outlet", name: "O", partnerType: "DISTRIBUTOR", isActive: true },
];

vi.mock("@/lib/db", () => ({
  prisma: {
    inventoryLedger: { findFirst: async () => ({ id: "l1" }) },
    partner: {
      findMany: async ({ where }: { where: { partnerType?: string } }) =>
        partners.filter((p) => !where.partnerType || p.partnerType === where.partnerType),
    },
  },
}));
vi.mock("./partner-inventory-report", () => ({
  computeInventoryRows: async (id: string) => {
    loaded.push(id);
    return { rows: [], partner: { deadStockDays: 60, targetCoverDays: 21 }, costRateBps: 0 };
  },
}));
vi.mock("./partner-reports", () => ({ resolvePeriod: () => ({}) }));
vi.mock("@/lib/partner/resolve-threshold", () => ({ resolveThreshold: async () => ({ forVariant: () => 5 }) }));

const { getNetworkStockRows } = await import("./network-stock");

describe("getNetworkStockRows", () => {
  it("only computes rows for AGENT partners", async () => {
    await getNetworkStockRows();
    expect(loaded).toEqual(["agent"]);
  });
});
