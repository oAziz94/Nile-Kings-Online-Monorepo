/** Backlog 11.1 — the storefront "in stock" facet ignores outlet (DISTRIBUTOR) stock. */
import { describe, it, expect, vi } from "vitest";

type Row = { variantId: string; stockAvailable: number; stockReserved: number; partner: { partnerType: string } };
const rows: Row[] = [{ variantId: "v1", stockAvailable: 7, stockReserved: 0, partner: { partnerType: "DISTRIBUTOR" } }];

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/cache/catalog-tags", () => ({ CATALOG_TAG: "c", CATEGORIES_TAG: "cc" }));
vi.mock("@/lib/db", () => ({
  prisma: {
    category: { findFirst: async () => ({ id: "c1" }) },
    variant: { findMany: async () => [{ id: "v1", name: "M", pricePiastres: 100 }] },
    partnerInventory: {
      groupBy: async ({ where }: { where: { partner?: { partnerType?: string } } }) => {
        const matching = rows.filter((r) => !where.partner?.partnerType || r.partner.partnerType === where.partner.partnerType);
        return matching.map((r) => ({ variantId: r.variantId, _sum: { stockAvailable: r.stockAvailable, stockReserved: r.stockReserved } }));
      },
    },
  },
}));

import { GET } from "./route";

describe("GET /api/categories/[slug]/filters", () => {
  it("hasInStock is false when only an outlet holds stock", async () => {
    const res = await GET({} as never, { params: Promise.resolve({ slug: "x" }) });
    expect((await res.json()).data.hasInStock).toBe(false);
  });
});
