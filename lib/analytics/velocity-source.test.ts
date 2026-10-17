import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { fn: string; args: unknown }[] = [];
const db = {
  orderGroups: [{ variantId: "v1", _sum: { quantity: 30 } }] as { variantId: string; _sum: { quantity: number } }[],
  storeGroups: [{ variantId: "v1", _sum: { quantity: 10 } }] as { variantId: string; _sum: { quantity: number } }[],
};

vi.mock("@/lib/db", () => ({
  prisma: {
    partner: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({
        deadStockDays: 60,
        targetCoverDays: 21,
        costRateBps: 7500,
        partnerType: where.id === "outlet" ? "DISTRIBUTOR" : "AGENT",
      }),
    },
    orderItem: {
      groupBy: async (args: unknown) => {
        calls.push({ fn: "orderItem.groupBy", args });
        return db.orderGroups;
      },
      findMany: async (args: unknown) => {
        calls.push({ fn: "orderItem.findMany", args });
        return [{ variantId: "v1", order: { createdAt: new Date() } }];
      },
    },
    storeSaleItem: {
      groupBy: async (args: unknown) => {
        calls.push({ fn: "storeSaleItem.groupBy", args });
        return db.storeGroups;
      },
      findMany: async (args: unknown) => {
        calls.push({ fn: "storeSaleItem.findMany", args });
        return [
          { variantId: "v1", sale: { soldAt: new Date("2026-05-01T10:00:00Z") } },
          { variantId: "v1", sale: { soldAt: new Date("2026-06-01T10:00:00Z") } },
          { variantId: "v2", sale: { soldAt: new Date("2026-04-01T10:00:00Z") } },
        ];
      },
    },
    partnerInventory: {
      findMany: async () => [
        {
          variantId: "v1",
          stockAvailable: 20,
          stockReserved: 0,
          variant: { sku: "S1", name: "M", colorName: "أحمر", pricePiastres: 10000, product: { id: "p1", name: "قميص", categoryId: "c1" } },
        },
      ],
    },
  },
}));

const { orderVelocitySource, storeVelocitySource, velocitySourceFor, cairoRangeBounds } = await import("./velocity-source");
const { computeInventoryRows } = await import("./partner-inventory-report");
const { resolvePeriod } = await import("./partner-reports");

beforeEach(() => {
  calls.length = 0;
});

describe("velocitySourceFor", () => {
  it("DISTRIBUTOR gets the store source, everything else the order source", () => {
    expect(velocitySourceFor("DISTRIBUTOR")).toBe(storeVelocitySource);
    expect(velocitySourceFor("AGENT")).toBe(orderVelocitySource);
    expect(velocitySourceFor(undefined)).toBe(orderVelocitySource);
  });
});

describe("storeVelocitySource", () => {
  it("reads COMPLETED StoreSaleItem lines of the outlet over Cairo-day bounds and divides by the period days", async () => {
    const range = { from: "2026-03-01", to: "2026-03-10" };
    const map = await storeVelocitySource.velocityForPeriod("outlet", range);
    expect(map.get("v1")).toEqual({ variantId: "v1", unitsSold: 10, velocityPerDay: 1 });
    const where = (calls[0].args as { where: { sale: { partnerId: string; status: string; soldAt: { gte: Date; lt: Date } } } }).where.sale;
    expect(calls[0].fn).toBe("storeSaleItem.groupBy");
    expect(where.partnerId).toBe("outlet");
    expect(where.status).toBe("COMPLETED");
    expect(where.soldAt).toEqual(cairoRangeBounds(range));
    // 10 inclusive days: lt is the start of the day after the range's last day.
    expect(where.soldAt.lt.getTime() - where.soldAt.gte.getTime()).toBe(10 * 24 * 3_600_000);
  });

  it("last sale per variant is the latest sale instant", async () => {
    const map = await storeVelocitySource.lastSaleByVariant("outlet");
    expect(map.get("v1")?.toISOString()).toBe("2026-06-01T10:00:00.000Z");
    expect(map.get("v2")?.toISOString()).toBe("2026-04-01T10:00:00.000Z");
    const where = (calls[0].args as { where: { sale: { status: string } } }).where.sale;
    expect(where.status).toBe("COMPLETED");
  });
});

describe("orderVelocitySource (agent path unchanged)", () => {
  it("still groups the partner's non-CANCELLED order lines", async () => {
    const map = await orderVelocitySource.velocityForPeriod("agent", { from: "2026-03-01", to: "2026-03-30" });
    expect(map.get("v1")?.velocityPerDay).toBe(1);
    const where = (calls[0].args as { where: { order: { assignedPartnerId: string; status: { not: string } } } }).where.order;
    expect(calls[0].fn).toBe("orderItem.groupBy");
    expect(where.assignedPartnerId).toBe("agent");
    expect(where.status).toEqual({ not: "CANCELLED" });
  });
});

describe("computeInventoryRows takes the velocity source from the partner type", () => {
  const period = resolvePeriod({ preset: "30d" });

  it("an outlet's cover days come from store sales (20 sellable at 10 units / 30 days = 60 days)", async () => {
    const { rows, source } = await computeInventoryRows("outlet", period);
    expect(source).toBe(storeVelocitySource);
    expect(calls.some((c) => c.fn === "storeSaleItem.groupBy")).toBe(true);
    expect(calls.some((c) => c.fn.startsWith("orderItem"))).toBe(false);
    expect(rows[0].daysOfCover).toBeCloseTo(60, 5);
    expect(rows[0].velocityPerWeek).toBeCloseTo((10 / 30) * 7, 5);
    // suggested reorder = ceil(21 * 10/30 - 20), floored at 0
    expect(rows[0].suggestedReorder).toBe(0);
  });

  it("an agent's cover days still come from online orders (20 sellable at 30 units / 30 days = 20 days)", async () => {
    const { rows, source } = await computeInventoryRows("agent", period);
    expect(source).toBe(orderVelocitySource);
    expect(calls.some((c) => c.fn.startsWith("storeSaleItem"))).toBe(false);
    expect(rows[0].daysOfCover).toBeCloseTo(20, 5);
    expect(rows[0].suggestedReorder).toBe(1); // ceil(21 * 1 - 20)
  });

  it("an explicit source overrides the partner type", async () => {
    const { source } = await computeInventoryRows("agent", period, storeVelocitySource);
    expect(source).toBe(storeVelocitySource);
  });
});
