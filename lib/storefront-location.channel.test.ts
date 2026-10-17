/** Backlog 11.1 — the storefront never resolves an outlet (DISTRIBUTOR) as the covering partner. */
import { describe, it, expect, vi } from "vitest";

const links = [
  { partner: { id: "outlet", partnerType: "DISTRIBUTOR" } },
  { partner: { id: "agent", partnerType: "AGENT" } },
];

vi.mock("react", async (orig) => ({ ...(await orig<typeof import("react")>()), cache: (fn: unknown) => fn }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/db", () => ({
  prisma: {
    reroutingRule: {
      findFirst: async ({ include }: { include: { partners: { where: { partner: { partnerType?: string } } } } }) => {
        const type = include.partners.where.partner.partnerType;
        return { partners: links.filter((l) => !type || l.partner.partnerType === type) };
      },
    },
  },
}));

const { getStorefrontStockContext } = await import("./storefront-location");
const { GOVERNORATE_OPTIONS } = await import("@/lib/services/shipping");

describe("getStorefrontStockContext", () => {
  it("resolves the AGENT even when an outlet sorts first", async () => {
    const ctx = await getStorefrontStockContext(GOVERNORATE_OPTIONS[0].value);
    expect(ctx.partnerId).toBe("agent");
  });
});
