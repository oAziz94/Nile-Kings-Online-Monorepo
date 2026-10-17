import { describe, expect, it } from "vitest";
import { cairoStartOfDayUtc } from "@/lib/analytics/cairo-day";
import {
  buildBaseWhere,
  decodeCursor,
  encodeCursor,
  listStoreSales,
  parseSalesQuery,
  type SalesListDb,
} from "./list-sales";

const parse = (qs: string) => {
  const r = parseSalesQuery(new URLSearchParams(qs));
  if (!r.ok) throw new Error(r.message);
  return r.value;
};

describe("parseSalesQuery", () => {
  it("defaults to COMPLETED+VOIDED, no range, page 30", () => {
    const f = parse("");
    expect(f.statuses).toEqual(["COMPLETED", "VOIDED"]);
    expect(f.from).toBeNull();
    expect(f.limit).toBe(30);
  });
  it("rejects bad days, inverted range, bad payment/status", () => {
    for (const qs of ["from=2026-13-01", "from=abc", "from=2026-10-10&to=2026-10-09", "paymentMethod=BTC", "status=OPEN"]) {
      expect(parseSalesQuery(new URLSearchParams(qs)).ok).toBe(false);
    }
  });
  it("caps limit and parses status list", () => {
    expect(parse("limit=9999").limit).toBe(100);
    expect(parse("status=VOIDED").statuses).toEqual(["VOIDED"]);
  });
});

describe("buildBaseWhere", () => {
  it("turns Cairo days into an inclusive [from, to+1) window and scopes to the partner", () => {
    const w = buildBaseWhere("p1", { from: "2026-10-10", to: "2026-10-12", paymentMethod: "CASH", q: null });
    expect(w.partnerId).toBe("p1");
    expect(w.AND).toEqual([
      { soldAt: { gte: cairoStartOfDayUtc("2026-10-10"), lt: cairoStartOfDayUtc("2026-10-13") } },
      { paymentMethod: "CASH" },
    ]);
  });
  it("search: name always, receipt no for short digits, phone for 4+ digits (normalised when valid)", () => {
    const base = { from: null, to: null, paymentMethod: null } as const;
    const num = buildBaseWhere("p1", { ...base, q: "12" }).AND as { OR: unknown[] }[];
    expect(num[0].OR).toEqual([{ customerName: { contains: "12", mode: "insensitive" } }, { receiptNo: 12 }]);
    const phone = buildBaseWhere("p1", { ...base, q: "01012345678" }).AND as { OR: unknown[] }[];
    expect(phone[0].OR).toContainEqual({ customerPhone: "+201012345678" });
    const name = buildBaseWhere("p1", { ...base, q: "منى" }).AND as { OR: unknown[] }[];
    expect(name[0].OR).toHaveLength(1);
  });
});

describe("listStoreSales", () => {
  const mk = (n: number) => ({
    id: `s${n}`,
    receiptNo: n,
    soldAt: new Date(Date.UTC(2026, 9, 17, 10, 0, 0) - n * 60_000),
    status: "COMPLETED" as const,
    paymentMethod: "CASH" as const,
    subtotalPiastres: 1000,
    customerName: null,
    customerPhone: null,
    voidReason: null,
    items: [{ quantity: 2 }, { quantity: 1 }],
  });
  const fake = (rows: ReturnType<typeof mk>[]) => {
    const seen: { findMany?: unknown; groupBy?: unknown } = {};
    const db: SalesListDb = {
      storeSale: {
        findMany: async (args) => {
          seen.findMany = args;
          return rows;
        },
        groupBy: async (args) => {
          seen.groupBy = args;
          return [
            { status: "COMPLETED", _count: { _all: 4 }, _sum: { subtotalPiastres: 12345 } },
            { status: "VOIDED", _count: { _all: 2 }, _sum: { subtotalPiastres: 999 } },
          ];
        },
      },
    };
    return { db, seen };
  };

  it("pages with a keyset cursor, counts pieces and reports totals (revenue COMPLETED only)", async () => {
    const { db, seen } = fake([mk(1), mk(2), mk(3)]);
    const res = await listStoreSales(db, "p1", { ...parse(""), limit: 2 });
    if ("badCursor" in res) throw new Error("bad cursor");
    expect(res.items.map((i) => i.receiptNo)).toEqual([1, 2]);
    expect(res.items[0].itemCount).toBe(3);
    expect(res.totals).toEqual({ count: 4, revenuePiastres: 12345, voidedCount: 2 });
    expect((seen.findMany as { take: number }).take).toBe(3);
    expect(decodeCursor(res.nextCursor!)?.id).toBe("s2");
  });

  it("null cursor on the last page; cursor + status narrow the list but not the totals", async () => {
    const { db, seen } = fake([mk(4)]);
    const c = encodeCursor(new Date("2026-10-17T09:00:00.000Z"), "s3");
    const res = await listStoreSales(db, "p1", { ...parse("status=VOIDED"), cursor: c });
    if ("badCursor" in res) throw new Error("bad cursor");
    expect(res.nextCursor).toBeNull();
    const listWhere = JSON.stringify((seen.findMany as { where: unknown }).where);
    expect(listWhere).toContain('"in":["VOIDED"]');
    expect(listWhere).toContain('"id":{"lt":"s3"}');
    expect(JSON.stringify((seen.groupBy as { where: unknown }).where)).not.toContain("VOIDED");
  });

  it("flags a malformed cursor", async () => {
    const { db } = fake([]);
    expect(await listStoreSales(db, "p1", { ...parse(""), cursor: "###" })).toEqual({ badCursor: true });
  });
});
