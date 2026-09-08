import { describe, it, expect, vi, beforeEach } from "vitest";

type ProductRow = { id: string; createdAt: Date; variantIds: string[] };
type OrderItemRow = { variantId: string; quantity: number; orderCreatedAt: Date; orderStatus: string };

class FakeDb {
  products: ProductRow[] = [];
  orderItems: OrderItemRow[] = [];

  product = {
    findMany: async ({ where }: any) => {
      // The helper always passes `where` straight through without inspecting it —
      // filtering is the caller's concern in production; here we just return everything
      // seeded, since these tests seed exactly the intended candidate set per case.
      void where;
      return this.products.map((p) => ({
        id: p.id,
        createdAt: p.createdAt,
        variants: p.variantIds.map((id) => ({ id })),
      }));
    },
  };

  orderItem = {
    groupBy: async ({ where }: any) => {
      const variantIdsIn: string[] = where.variantId.in;
      const cutoff: Date = where.order.createdAt.gte;
      const notStatus: string = where.order.status.not;
      const sums = new Map<string, number>();
      for (const item of this.orderItems) {
        if (!variantIdsIn.includes(item.variantId)) continue;
        if (item.orderCreatedAt < cutoff) continue;
        if (item.orderStatus === notStatus) continue;
        sums.set(item.variantId, (sums.get(item.variantId) ?? 0) + item.quantity);
      }
      return [...sums.entries()].map(([variantId, total]) => ({
        variantId,
        _sum: { quantity: total },
      }));
    },
  };
}

const fakeDb = new FakeDb();

vi.mock("@/lib/db", () => ({
  get prisma() {
    return fakeDb;
  },
}));

const { getProductIdsRankedByRecentSales } = await import("./ranked-listing");

beforeEach(() => {
  fakeDb.products = [];
  fakeDb.orderItems = [];
});

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

describe("getProductIdsRankedByRecentSales", () => {
  it("ranks products by total recent units sold, summed across all of a product's variants", async () => {
    fakeDb.products = [
      { id: "p1", createdAt: new Date(now - 10 * DAY), variantIds: ["v1a", "v1b"] },
      { id: "p2", createdAt: new Date(now - 20 * DAY), variantIds: ["v2"] },
    ];
    fakeDb.orderItems = [
      { variantId: "v1a", quantity: 3, orderCreatedAt: new Date(now - 5 * DAY), orderStatus: "CONFIRMED" },
      { variantId: "v1b", quantity: 4, orderCreatedAt: new Date(now - 5 * DAY), orderStatus: "CONFIRMED" },
      { variantId: "v2", quantity: 5, orderCreatedAt: new Date(now - 5 * DAY), orderStatus: "CONFIRMED" },
    ];
    // p1 totals 7 (3+4) across its two variants, beating p2's 5 from a single variant.
    const ranked = await getProductIdsRankedByRecentSales({});
    expect(ranked).toEqual(["p1", "p2"]);
  });

  it("excludes cancelled orders from the sales count", async () => {
    fakeDb.products = [
      { id: "p1", createdAt: new Date(now - 10 * DAY), variantIds: ["v1"] },
      { id: "p2", createdAt: new Date(now - 20 * DAY), variantIds: ["v2"] },
    ];
    fakeDb.orderItems = [
      { variantId: "v1", quantity: 100, orderCreatedAt: new Date(now - 5 * DAY), orderStatus: "CANCELLED" },
      { variantId: "v2", quantity: 1, orderCreatedAt: new Date(now - 5 * DAY), orderStatus: "CONFIRMED" },
    ];
    // p1's 100 units were cancelled and must not count; p2's 1 real sale should win.
    const ranked = await getProductIdsRankedByRecentSales({});
    expect(ranked).toEqual(["p2", "p1"]);
  });

  it("excludes sales older than the 30-day window", async () => {
    fakeDb.products = [
      { id: "p1", createdAt: new Date(now - 10 * DAY), variantIds: ["v1"] },
      { id: "p2", createdAt: new Date(now - 20 * DAY), variantIds: ["v2"] },
    ];
    fakeDb.orderItems = [
      { variantId: "v1", quantity: 100, orderCreatedAt: new Date(now - 45 * DAY), orderStatus: "CONFIRMED" },
      { variantId: "v2", quantity: 1, orderCreatedAt: new Date(now - 5 * DAY), orderStatus: "CONFIRMED" },
    ];
    const ranked = await getProductIdsRankedByRecentSales({});
    expect(ranked).toEqual(["p2", "p1"]);
  });

  it("never drops a zero-sales product — it sorts to the tail, ordered newest-first", async () => {
    fakeDb.products = [
      { id: "old-no-sales", createdAt: new Date(now - 100 * DAY), variantIds: ["v1"] },
      { id: "new-no-sales", createdAt: new Date(now - 1 * DAY), variantIds: ["v2"] },
      { id: "has-sales", createdAt: new Date(now - 50 * DAY), variantIds: ["v3"] },
    ];
    fakeDb.orderItems = [
      { variantId: "v3", quantity: 2, orderCreatedAt: new Date(now - 5 * DAY), orderStatus: "CONFIRMED" },
    ];
    const ranked = await getProductIdsRankedByRecentSales({});
    expect(ranked).toEqual(["has-sales", "new-no-sales", "old-no-sales"]);
  });

  it("returns an empty array when no products match", async () => {
    const ranked = await getProductIdsRankedByRecentSales({});
    expect(ranked).toEqual([]);
  });

  it("handles a product with zero variants without throwing", async () => {
    fakeDb.products = [{ id: "no-variants", createdAt: new Date(now), variantIds: [] }];
    const ranked = await getProductIdsRankedByRecentSales({});
    expect(ranked).toEqual(["no-variants"]);
  });
});
