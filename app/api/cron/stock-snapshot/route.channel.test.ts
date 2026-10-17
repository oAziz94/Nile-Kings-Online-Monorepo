/** Backlog 11.1 — the daily stock snapshot cron never snapshots an outlet (DISTRIBUTOR). */
import { describe, it, expect, vi } from "vitest";

const snapshotted: string[] = [];
const partners = [
  { id: "agent", partnerType: "AGENT", isActive: true },
  { id: "outlet", partnerType: "DISTRIBUTOR", isActive: true },
];

vi.mock("@/lib/db", () => ({
  prisma: {
    partner: {
      findMany: async ({ where }: { where: { partnerType?: string } }) =>
        partners.filter((p) => !where.partnerType || p.partnerType === where.partnerType),
    },
    partnerStockSnapshot: {
      upsert: async ({ where }: { where: { partnerId_day: { partnerId: string } } }) => {
        snapshotted.push(where.partnerId_day.partnerId);
      },
      deleteMany: async () => ({ count: 0 }),
    },
  },
}));
vi.mock("@/lib/analytics/partner-stock-totals", () => ({
  computePartnerStockTotals: async () => ({
    sellableUnits: 0,
    reservedUnits: 0,
    valuationCostPiastres: 0,
    valuationPricePiastres: 0,
    coverDays: null,
    deadStockSkus: 0,
    outOfStockSkus: 0,
  }),
}));
vi.mock("@/lib/audit/retention", () => ({ pruneAdminAuditLog: async () => ({ pruned: 0 }) }));

import { GET } from "./route";

describe("GET /api/cron/stock-snapshot", () => {
  it("snapshots only AGENT partners", async () => {
    process.env.CRON_SECRET = "s";
    const res = await GET({ headers: new Headers({ authorization: "Bearer s" }) } as never);
    expect(res.status).toBe(200);
    expect(snapshotted).toEqual(["agent"]);
  });
});
