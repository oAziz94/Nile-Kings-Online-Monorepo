/** Backlog 11.1 — the admin "low stock" queue never loads an outlet (DISTRIBUTOR). */
import { describe, it, expect, vi } from "vitest";

const loaded: string[] = [];
const partners = [
  { id: "agent", name: "A", partnerType: "AGENT", isActive: true },
  { id: "outlet", name: "O", partnerType: "DISTRIBUTOR", isActive: true },
];

vi.mock("@/lib/db", () => ({
  prisma: {
    partner: {
      findMany: async ({ where }: { where: { partnerType?: string } }) =>
        partners.filter((p) => !where.partnerType || p.partnerType === where.partnerType),
    },
  },
}));
vi.mock("@/lib/analytics/partner-inventory-report", () => ({
  getPartnerReorderRows: async (id: string) => {
    loaded.push(id);
    return [];
  },
}));
vi.mock("@/lib/partner/resolve-threshold", () => ({ resolveThreshold: async () => ({ forVariant: () => 5 }) }));

const { buildLowStockQueue } = await import("./today");

describe("buildLowStockQueue", () => {
  it("only reads reorder rows for AGENT partners", async () => {
    await buildLowStockQueue();
    expect(loaded).toEqual(["agent"]);
  });
});
