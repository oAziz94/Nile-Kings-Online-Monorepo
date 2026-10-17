import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));

import { addDaysIso, resolvePeriod, todayIso } from "./partner-reports";
import { cairoStartOfDayUtc } from "./cairo-day";
import {
  buildOutletBreakdowns,
  buildOutletHeadline,
  buildOutletSeries,
  cairoHour,
  getOutletSalesFullBreakdown,
  getOutletSalesReport,
  type OutletSalesDb,
} from "./outlet-sales-report";
import { outletRowsToCsv } from "@/lib/reports/handlers/outlet-sales";

type FakeSale = {
  id: string;
  partnerId: string;
  status: "COMPLETED" | "VOIDED";
  soldAt: Date;
  paymentMethod: "CASH" | "INSTAPAY" | "CARD";
  subtotalPiastres: number;
  items: ReturnType<typeof line>[];
};

const line = (productId: string, name: string, size: string, colour: string, qty: number, price: number) => ({
  quantity: qty,
  unitPricePiastres: price,
  productName: name,
  variantName: size,
  sku: `${productId}-${size}`,
  variantId: `${productId}-${size}-${colour}`,
  colorName: colour,
  productId,
});

const at = (iso: string, hour: number) => new Date(cairoStartOfDayUtc(iso).getTime() + hour * 3_600_000 + 5 * 60_000);

/** Fake database honouring exactly the filters the report relies on. */
function fakeDb(sales: FakeSale[]): OutletSalesDb {
  return {
    storeSale: {
      async findMany(args: unknown) {
        const { where } = args as { where: { partnerId: string; status: string; soldAt: { gte: Date; lt: Date } } };
        return sales
          .filter((s) => s.partnerId === where.partnerId && s.status === where.status && s.soldAt >= where.soldAt.gte && s.soldAt < where.soldAt.lt)
          .map((s) => ({
            id: s.id,
            soldAt: s.soldAt,
            paymentMethod: s.paymentMethod,
            subtotalPiastres: s.subtotalPiastres,
            items: s.items.map((i) => ({
              quantity: i.quantity,
              unitPricePiastres: i.unitPricePiastres,
              productName: i.productName,
              variantName: i.variantName,
              sku: i.sku,
              variantId: i.variantId,
              variant: { colorName: i.colorName, product: { id: i.productId, slug: `slug-${i.productId}` } },
            })),
          }));
      },
    },
  };
}

const today = todayIso();
const yesterday = addDaysIso(today, -1);
const lastWeek = addDaysIso(today, -9); // inside the previous 7-day window (-13..-7)

// 5 sales across 2 days; the 5th is VOIDED and must change nothing.
const sales: FakeSale[] = [
  { id: "s1", partnerId: "P", status: "COMPLETED", soldAt: at(yesterday, 10), paymentMethod: "CASH", subtotalPiastres: 30000, items: [line("p1", "قميص", "M", "أحمر", 2, 10000), line("p2", "بنطلون", "L", "أزرق", 1, 10000)] },
  { id: "s2", partnerId: "P", status: "COMPLETED", soldAt: at(yesterday, 15), paymentMethod: "INSTAPAY", subtotalPiastres: 20000, items: [line("p1", "قميص", "L", "أحمر", 2, 10000)] },
  { id: "s3", partnerId: "P", status: "COMPLETED", soldAt: at(today, 10), paymentMethod: "CASH", subtotalPiastres: 15000, items: [line("p2", "بنطلون", "L", "أزرق", 1, 15000)] },
  { id: "s4", partnerId: "P", status: "COMPLETED", soldAt: at(today, 10), paymentMethod: "CARD", subtotalPiastres: 10000, items: [line("p1", "قميص", "M", "أسود", 1, 10000)] },
  { id: "s5", partnerId: "P", status: "VOIDED", soldAt: at(today, 11), paymentMethod: "CASH", subtotalPiastres: 99000, items: [line("p1", "قميص", "M", "أحمر", 9, 11000)] },
  // Another outlet's sale, same day: never counted.
  { id: "x1", partnerId: "OTHER", status: "COMPLETED", soldAt: at(today, 10), paymentMethod: "CASH", subtotalPiastres: 77700, items: [line("p1", "قميص", "M", "أحمر", 1, 77700)] },
  // Previous period (7d preset): one sale of 25000.
  { id: "p1", partnerId: "P", status: "COMPLETED", soldAt: at(lastWeek, 12), paymentMethod: "CASH", subtotalPiastres: 25000, items: [line("p1", "قميص", "M", "أحمر", 5, 5000)] },
];

describe("getOutletSalesReport (fake db: 5 sales over 2 days, 1 voided)", () => {
  it("headline counts only COMPLETED sales of this outlet and compares with the previous period", async () => {
    const report = await getOutletSalesReport("P", { preset: "7d" }, fakeDb(sales));
    const h = Object.fromEntries(report.headline.map((x) => [x.key, x]));
    expect(h.revenue.value).toBe(75000);
    expect(h.revenue.previous).toBe(25000);
    expect(h.revenue.delta.direction).toBe("up");
    expect(h.revenue.delta.changePct).toBe(200);
    expect(h.receipts.value).toBe(4);
    expect(h.receipts.previous).toBe(1);
    expect(h.units.value).toBe(7);
    expect(h.averageReceipt.value).toBe(18750);
    expect(h.averageReceipt.previous).toBe(25000);
    expect(h.averageReceipt.delta.direction).toBe("down");
  });

  it("by-day series covers every day of the period and puts revenue on the right Cairo day", async () => {
    const report = await getOutletSalesReport("P", { preset: "7d" }, fakeDb(sales));
    const s = report.series[0];
    expect(s.points).toHaveLength(7);
    expect(s.points.find((p) => p.x === yesterday)?.y).toBe(50000);
    expect(s.points.find((p) => p.x === today)?.y).toBe(25000);
    expect(s.points.filter((p) => p.y > 0)).toHaveLength(2);
    expect(s.previousPoints.reduce((a, p) => a + p.y, 0)).toBe(25000);
    expect(report.breakdowns.day.rows.map((r) => r.date)).toEqual([today, yesterday]);
  });

  it("by product merges variants, shares sum to 100, previous revenue attached", async () => {
    const report = await getOutletSalesReport("P", { preset: "7d" }, fakeDb(sales));
    const rows = report.breakdowns.product.rows;
    expect(rows.map((r) => r.productName)).toEqual(["قميص", "بنطلون"]);
    expect(rows[0]).toMatchObject({ units: 5, revenuePiastres: 50000, previousRevenuePiastres: 25000, receiptCount: 3 });
    expect(rows[1]).toMatchObject({ units: 2, revenuePiastres: 25000, previousRevenuePiastres: 0, receiptCount: 2 });
    expect(rows.reduce((a, r) => a + r.revenueSharePct, 0)).toBeCloseTo(100, 5);
  });

  it("payment methods keep the fixed CASH, INSTAPAY, CARD order", async () => {
    const report = await getOutletSalesReport("P", { preset: "7d" }, fakeDb(sales));
    expect(report.breakdowns.payment.rows.map((r) => [r.key, r.receiptCount, r.revenuePiastres])).toEqual([
      ["CASH", 2, 45000],
      ["INSTAPAY", 1, 20000],
      ["CARD", 1, 10000],
    ]);
  });

  it("size and colour top lists rank by units; hours rank by revenue", async () => {
    const report = await getOutletSalesReport("P", { preset: "7d" }, fakeDb(sales));
    expect(report.breakdowns.size.rows.map((r) => [r.label, r.units])).toEqual([
      ["L", 4],
      ["M", 3],
    ]);
    expect(report.breakdowns.colour.rows[0]).toMatchObject({ label: "أحمر", units: 4 });
    const hours = report.breakdowns.hour.rows;
    expect(hours[0]).toMatchObject({ hour: 10, receiptCount: 3, revenuePiastres: 55000 });
    expect(hours[1]).toMatchObject({ hour: 15, receiptCount: 1 });
  });

  it("an outlet with no sales gets zero tiles with a defined comparison and empty tables", async () => {
    const report = await getOutletSalesReport("EMPTY", { preset: "30d" }, fakeDb(sales));
    expect(report.headline.every((h) => h.value === 0 && h.delta.direction === "flat")).toBe(true);
    expect(report.breakdowns.product.total).toBe(0);
  });

  it("CSV export rows: one line per product plus a header", async () => {
    const rows = await getOutletSalesFullBreakdown("P", { preset: "7d" }, "product", fakeDb(sales));
    const csv = outletRowsToCsv("product", rows);
    expect(csv.split("\n")).toHaveLength(3);
    expect(csv.split("\n")[1]).toContain("قميص");
  });
});

describe("pure builders", () => {
  it("cairoHour reads the Cairo clock, not UTC", () => {
    expect(cairoHour(at("2026-01-15", 23))).toBe(23);
    expect(cairoHour(at("2026-07-15", 0))).toBe(0);
  });

  it("builders accept empty input", () => {
    const period = resolvePeriod({ preset: "today" });
    expect(buildOutletHeadline([], [])).toHaveLength(4);
    expect(buildOutletSeries([], [], period)[0].points).toHaveLength(1);
    expect(buildOutletBreakdowns([], []).product).toEqual([]);
  });
});
