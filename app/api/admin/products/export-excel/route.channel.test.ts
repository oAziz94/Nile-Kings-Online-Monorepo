/** Backlog 11.1 — catalogue Excel export stock excludes outlet (DISTRIBUTOR) stock. */
import { describe, it, expect, vi } from "vitest";

type Row = { variantId: string; stockAvailable: number; stockReserved: number; partner: { partnerType: string } };
const rows: Row[] = [
  { variantId: "v1", stockAvailable: 10, stockReserved: 2, partner: { partnerType: "AGENT" } },
  { variantId: "v1", stockAvailable: 7, stockReserved: 0, partner: { partnerType: "DISTRIBUTOR" } },
];
let exported: { variants: { stockAvailable: number }[] }[] = [];

vi.mock("@/lib/auth/session", () => ({ requireAdmin: vi.fn(async () => ({ userId: "a1", role: "ADMIN" })) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    product: {
      findMany: async () => [
        { id: "p1", name: "P", slug: "p", description: null, imageUrl: null, variants: [{ id: "v1", sku: "S", name: "M", colorName: null, colorHex: null, pricePiastres: 100, imageUrl: null }] },
      ],
    },
    partnerInventory: {
      groupBy: async ({ where }: { where?: { partner?: { partnerType?: string } } }) => {
        const matching = rows.filter((r) => !where?.partner?.partnerType || r.partner.partnerType === where.partner.partnerType);
        return [{ variantId: "v1", _sum: { stockAvailable: matching.reduce((s, r) => s + r.stockAvailable, 0), stockReserved: matching.reduce((s, r) => s + r.stockReserved, 0) } }];
      },
    },
  },
}));
vi.mock("@/lib/catalog-export", () => ({
  buildCatalogXlsx: (p: typeof exported) => {
    exported = p;
    return Buffer.from("x");
  },
  catalogExportFilename: () => "f.xlsx",
}));

import { GET } from "./route";

describe("GET /api/admin/products/export-excel", () => {
  it("exports online-only sellable stock", async () => {
    const res = await GET({} as never);
    expect(res.status).toBe(200);
    expect(exported[0].variants[0].stockAvailable).toBe(8);
  });
});
