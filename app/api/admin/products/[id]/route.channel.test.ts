/** Backlog 11.1 — admin product detail "متوفر عند N شركاء" ignores outlet (DISTRIBUTOR) stock. */
import { describe, it, expect, vi } from "vitest";

type Row = { partnerId: string; variantId: string; stockAvailable: number; partner: { partnerType: string } };
const rows: Row[] = [
  { partnerId: "agent", variantId: "v1", stockAvailable: 10, partner: { partnerType: "AGENT" } },
  { partnerId: "outlet", variantId: "v1", stockAvailable: 7, partner: { partnerType: "DISTRIBUTOR" } },
];

vi.mock("@/lib/auth/session", () => ({ requireAdmin: vi.fn(async () => ({ userId: "a1", role: "ADMIN" })) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    product: { findUnique: async () => ({ id: "p1", variants: [{ id: "v1" }], variantImages: [] }) },
    partnerInventory: {
      groupBy: async ({ where }: { where: { partner?: { partnerType?: string } } }) => {
        const matching = rows.filter((r) => !where.partner?.partnerType || r.partner.partnerType === where.partner.partnerType);
        return matching.length ? [{ variantId: "v1", _count: { partnerId: matching.length } }] : [];
      },
    },
  },
}));
vi.mock("@/lib/audit/admin-audit", () => ({ logAdminAction: vi.fn(), requestIp: () => null, sanitizeForAudit: (x: unknown) => x }));
vi.mock("@/lib/cache/catalog-tags", () => ({ revalidateCatalog: vi.fn() }));

import { GET } from "./route";

describe("GET /api/admin/products/[id]", () => {
  it("counts only online partners in partnerCount", async () => {
    const res = await GET({} as never, { params: Promise.resolve({ id: "p1" }) });
    const json = await res.json();
    expect(json.data.variants[0].partnerCount).toBe(1);
  });
});
