/** Backlog 11.1 — an outlet (DISTRIBUTOR) linked to a rule is never an eligible online partner. */
import { describe, it, expect, vi } from "vitest";

const links = [
  { isActive: true, priority: 1, partner: { id: "outlet", isActive: true, partnerType: "DISTRIBUTOR" } },
  { isActive: true, priority: 2, partner: { id: "agent", isActive: true, partnerType: "AGENT" } },
];

vi.mock("@/lib/db", () => ({
  prisma: {
    reroutingRule: {
      findFirst: async ({ include }: { include: { partners: { where: { partner: { partnerType?: string } } } } }) => {
        const type = include.partners.where.partner.partnerType;
        return { id: "r1", partners: links.filter((l) => !type || l.partner.partnerType === type) };
      },
    },
  },
}));

const { getEligiblePartnersForGovernorate } = await import("./partner-inventory");

describe("getEligiblePartnersForGovernorate", () => {
  it("drops DISTRIBUTOR links defensively", async () => {
    const eligible = await getEligiblePartnersForGovernorate("cairo");
    expect(eligible.map((e) => e.partner.id)).toEqual(["agent"]);
  });
});
