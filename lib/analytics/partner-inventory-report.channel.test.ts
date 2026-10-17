/** Backlog 11.1 — the network inventory report never loads an outlet (DISTRIBUTOR). */
import { describe, it, expect, vi } from "vitest";

const loaded: string[] = [];
const partners = [
  { id: "agent", name: "A", partnerType: "AGENT", isActive: true },
  { id: "outlet", name: "O", partnerType: "DISTRIBUTOR", isActive: true },
];

vi.mock("@/lib/db", () => ({
  prisma: {
    partner: {
      findMany: async ({ where }: { where: { partnerType?: string } }) => {
        const out = partners.filter((p) => !where.partnerType || p.partnerType === where.partnerType);
        loaded.push(...out.map((p) => p.id));
        return out;
      },
      // computeInventoryRows is real here; stop it right after the partner list is read.
      findUniqueOrThrow: async () => {
        throw new Error("STOP");
      },
    },
  },
}));

const { computeNetworkInventoryRows } = await import("./partner-inventory-report");
const { resolvePeriod } = await import("./partner-reports");

describe("computeNetworkInventoryRows", () => {
  it("lists only AGENT partners", async () => {
    await expect(computeNetworkInventoryRows(resolvePeriod({ preset: "30d" }))).rejects.toThrow("STOP");
    expect(loaded).toEqual(["agent"]);
  });
});
