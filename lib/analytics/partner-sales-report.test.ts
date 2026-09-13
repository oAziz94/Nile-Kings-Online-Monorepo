import { describe, expect, it } from "vitest";
import { attachRevenueDelta } from "./partner-sales-report";

describe("7.4 — attachRevenueDelta (shared by category/governorate/payment breakdown rows)", () => {
  it("a key present in both periods gets a hand-computed delta; a current-only key compares against 0", () => {
    const currentRows = [
      { key: "cairo", label: "القاهرة", units: 10, revenuePiastres: 30_000, orderCount: 3 },
      { key: "giza", label: "الجيزة", units: 2, revenuePiastres: 8_000, orderCount: 1 },
    ];
    // cairo: 30,000 now vs. 20,000 previously -> up, +50%. giza: no previous-period row.
    const previousByKey = new Map([["cairo", 20_000]]);
    const rows = attachRevenueDelta(currentRows, previousByKey);

    const cairo = rows.find((r) => r.key === "cairo")!;
    expect(cairo.previousRevenuePiastres).toBe(20_000);
    expect(cairo.revenueDelta).toEqual({ direction: "up", changeAbs: 10_000, changePct: 50 });

    const giza = rows.find((r) => r.key === "giza")!;
    expect(giza.previousRevenuePiastres).toBe(0);
    expect(giza.revenueDelta.direction).toBe("up");
    expect(giza.revenueDelta.changePct).toBeNull(); // previous is 0, current isn't -> undefined %

    // Every existing field survives the attach step (additive-only).
    expect(cairo.units).toBe(10);
    expect(cairo.orderCount).toBe(3);
    expect(cairo.label).toBe("القاهرة");
  });

  it("a key with equal current and previous revenue reports a flat, defined 0% delta", () => {
    const currentRows = [{ key: "cod", label: "الدفع عند الاستلام", units: 0, revenuePiastres: 15_000, orderCount: 2 }];
    const rows = attachRevenueDelta(currentRows, new Map([["cod", 15_000]]));
    expect(rows[0].revenueDelta).toEqual({ direction: "flat", changeAbs: 0, changePct: 0 });
  });
});
