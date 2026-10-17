/** Backlog 11.1 — the admin (network) product/variant stock report excludes outlet stock. */
import { describe, it, expect, vi } from "vitest";

type Row = { variantId: string; stockAvailable: number; stockReserved: number; partner: { partnerType: string } };
const rows: Row[] = [
  { variantId: "v1", stockAvailable: 10, stockReserved: 2, partner: { partnerType: "AGENT" } },
  { variantId: "v1", stockAvailable: 7, stockReserved: 0, partner: { partnerType: "DISTRIBUTOR" } },
];

vi.mock("@/lib/db", () => ({
  prisma: {
    variant: { findMany: async () => [{ id: "v1", name: "M", colorName: null, sku: "S", pricePiastres: 100, product: { id: "p1", name: "P" } }] },
    orderItem: { groupBy: async () => [] },
    partnerInventory: {
      groupBy: async ({ where }: { where: { partner?: { partnerType?: string } } }) => {
        const matching = rows.filter((r) => !where.partner?.partnerType || r.partner.partnerType === where.partner.partnerType);
        return [{ variantId: "v1", _sum: { stockAvailable: matching.reduce((s, r) => s + r.stockAvailable, 0), stockReserved: matching.reduce((s, r) => s + r.stockReserved, 0) } }];
      },
    },
  },
}));

import { getProductVariantReport } from "./queries";

describe("getProductVariantReport (network scope)", () => {
  it("sums only online partner stock", async () => {
    const [row] = await getProductVariantReport(null, null, {});
    expect(row.stockAvailable).toBe(10);
    expect(row.stockReserved).toBe(2);
  });
});
