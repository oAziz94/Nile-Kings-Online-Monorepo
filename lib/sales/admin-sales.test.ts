import { describe, expect, it, vi } from "vitest";
import { listOutletSalesForAdmin, type AdminSalesDb } from "./admin-sales";
import type { SalesFilters } from "./list-sales";

const filters: SalesFilters = { from: null, to: null, paymentMethod: null, statuses: ["COMPLETED", "VOIDED"], q: null, cursor: null, limit: 30 };

function fakeDb(partnerType: string | null) {
  const findMany = vi.fn(async () => []);
  const groupBy = vi.fn(async () => []);
  const db = {
    partner: { findUnique: async () => (partnerType ? { partnerType } : null) },
    storeSale: { findMany, groupBy },
  } as unknown as AdminSalesDb;
  return { db, findMany, groupBy };
}

describe("listOutletSalesForAdmin", () => {
  it("not_found for a missing partner, and never queries sales", async () => {
    const { db, findMany } = fakeDb(null);
    expect(await listOutletSalesForAdmin(db, "x", filters)).toEqual({ ok: false, reason: "not_found" });
    expect(findMany).not.toHaveBeenCalled();
  });
  it("not_outlet for an AGENT, and never queries sales", async () => {
    const { db, findMany, groupBy } = fakeDb("AGENT");
    expect(await listOutletSalesForAdmin(db, "a", filters)).toEqual({ ok: false, reason: "not_outlet" });
    expect(findMany).not.toHaveBeenCalled();
    expect(groupBy).not.toHaveBeenCalled();
  });
  it("lists an outlet's sales scoped to that partner with empty totals", async () => {
    const { db, findMany } = fakeDb("DISTRIBUTOR");
    const r = await listOutletSalesForAdmin(db, "o1", filters);
    expect(r).toEqual({ ok: true, value: { items: [], nextCursor: null, totals: { count: 0, revenuePiastres: 0, voidedCount: 0 } } });
    expect((findMany.mock.calls[0] as unknown as [{ where: { AND: { partnerId?: string }[] } }])[0].where.AND[0].partnerId).toBe("o1");
  });
  it("bad_cursor passes through", async () => {
    const { db } = fakeDb("DISTRIBUTOR");
    expect(await listOutletSalesForAdmin(db, "o1", { ...filters, cursor: "!!" })).toEqual({ ok: false, reason: "bad_cursor" });
  });
});
