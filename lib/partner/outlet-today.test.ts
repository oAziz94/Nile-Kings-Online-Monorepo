import { describe, expect, it } from "vitest";
import { buildOutletToday, type OutletTodayDb } from "./outlet-today";

type Sale = {
  id: string;
  receiptNo: number;
  status: "COMPLETED" | "VOIDED";
  soldAt: Date;
  subtotalPiastres: number;
  paymentMethod: "CASH" | "INSTAPAY" | "CARD";
  items: { quantity: number }[];
};

function variant(id: string, price: number, available: number, reserved = 0) {
  return {
    stockAvailable: available,
    stockReserved: reserved,
    variant: {
      id,
      name: "L",
      colorName: "أبيض",
      pricePiastres: price,
      product: { id: `p-${id}`, name: `منتج ${id}`, categoryId: "c1", category: { slug: "men" } },
    },
  };
}

function fakeDb(sales: Sale[], inventory: ReturnType<typeof variant>[]): OutletTodayDb {
  return {
    storeSale: {
      async findMany(args) {
        let rows = sales.filter((s) => s.status === args.where.status);
        if (args.where.soldAt) rows = rows.filter((s) => s.soldAt >= args.where.soldAt!.gte);
        if (args.orderBy) rows = [...rows].sort((a, b) => b.soldAt.getTime() - a.soldAt.getTime());
        if (args.take) rows = rows.slice(0, args.take);
        return rows;
      },
    },
    partnerInventory: { findMany: async () => inventory },
  };
}

// 2026-10-17 13:00 Cairo (UTC+3 until 30 Oct) -> Cairo midnight is 2026-10-16T21:00Z.
const NOW = new Date("2026-10-17T10:00:00Z");
const thresholds = { forVariant: () => 5 };

const sale = (n: number, soldAt: string, total: number, qty: number, status: Sale["status"] = "COMPLETED"): Sale => ({
  id: `s${n}`,
  receiptNo: n,
  status,
  soldAt: new Date(soldAt),
  subtotalPiastres: total,
  paymentMethod: "CASH",
  items: [{ quantity: qty }],
});

describe("buildOutletToday", () => {
  it("counts only COMPLETED sales since Cairo midnight in the KPIs", async () => {
    const db = fakeDb(
      [
        sale(1, "2026-10-17T08:00:00Z", 30_000, 2),
        sale(2, "2026-10-16T21:30:00Z", 20_000, 1), // 00:30 Cairo: today
        sale(3, "2026-10-16T20:30:00Z", 99_000, 9), // 23:30 Cairo yesterday: not today
        sale(4, "2026-10-17T09:00:00Z", 77_000, 7, "VOIDED"),
      ],
      []
    );
    const out = await buildOutletToday(db, { partnerId: "p", partnerName: "منفذ", thresholds, now: NOW });
    expect(out.kpis.salesCountToday).toBe(2);
    expect(out.kpis.revenueTodayPiastres).toBe(50_000);
    expect(out.kpis.unitsSoldToday).toBe(3);
  });

  it("values stock at sellable (available - reserved) x catalogue price and flags low stock via the resolver", async () => {
    const db = fakeDb([], [variant("a", 10_000, 12, 2), variant("b", 5_000, 4, 0), variant("c", 1_000, 0, 0)]);
    const out = await buildOutletToday(db, { partnerId: "p", partnerName: "منفذ", thresholds, now: NOW });
    expect(out.kpis.sellableUnits).toBe(14);
    expect(out.kpis.stockValuePiastres).toBe(10 * 10_000 + 4 * 5_000);
    expect(out.kpis.underThresholdCount).toBe(2);
    expect(out.queue.lowStock.rows.map((r) => r.variantId)).toEqual(["c", "b"]);
  });

  it("returns a zero-filled 14-day trend ending today and the latest 5 completed receipts", async () => {
    const sales = [1, 2, 3, 4, 5, 6].map((n) => sale(n, `2026-10-1${n}T09:00:00Z`, n * 1_000, 1));
    sales.push(sale(7, "2026-10-17T09:30:00Z", 5_000, 1, "VOIDED"));
    const out = await buildOutletToday(fakeDb(sales, []), { partnerId: "p", partnerName: "منفذ", thresholds, now: NOW });
    expect(out.trend).toHaveLength(14);
    expect(out.trend[13].date).toBe("2026-10-17");
    expect(out.trend[0].date).toBe("2026-10-04");
    expect(out.trend[12].revenuePiastres).toBe(6_000); // 2026-10-16 -> sale 6
    expect(out.trend[3].revenuePiastres).toBe(0);
    expect(out.queue.recentReceipts.map((r) => r.receiptNo)).toEqual([6, 5, 4, 3, 2]);
  });

  it("an outlet with no sales and no stock is all zeros", async () => {
    const out = await buildOutletToday(fakeDb([], []), { partnerId: "p", partnerName: "منفذ", thresholds, now: NOW });
    expect(out.kpis).toEqual({
      salesCountToday: 0,
      revenueTodayPiastres: 0,
      unitsSoldToday: 0,
      stockValuePiastres: 0,
      sellableUnits: 0,
      underThresholdCount: 0,
    });
    expect(out.queue.recentReceipts).toEqual([]);
  });
});
