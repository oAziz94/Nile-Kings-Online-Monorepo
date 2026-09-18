import { describe, expect, it } from "vitest";
import { formatMoney2 } from "./build";

/**
 * Backlog 10.14 (verifier, third pass) — `formatMoney2` must format straight from piastres,
 * never through `lib/catalog.ts`'s `piastresToEgp` (which rounds to whole pounds for the
 * on-screen tiles, on purpose): the print pages promise money "in pounds with two decimals",
 * and rounding before appending ".00" silently threw away the piastre remainder on every
 * figure that wasn't an exact multiple of 100 piastres.
 */
describe("10.14 — formatMoney2: piastre-exact, never through piastresToEgp's whole-pound round", () => {
  it("the verifier's own live figures: 5,324,791 piastres -> 53,247.91 ج.م (not 53,248.00)", () => {
    expect(formatMoney2(5_324_791)).toBe("53,247.91 ج.م");
  });

  it("12,934,690 piastres -> 129,346.90 ج.م (not 129,347.00)", () => {
    expect(formatMoney2(12_934_690)).toBe("129,346.90 ج.م");
  });

  it("54,338,994 piastres -> 543,389.94 ج.م (not 543,390.00)", () => {
    expect(formatMoney2(54_338_994)).toBe("543,389.94 ج.م");
  });

  it("an exact multiple of 100 piastres still prints two zero digits: 100 -> 1.00 ج.م", () => {
    expect(formatMoney2(100)).toBe("1.00 ج.م");
  });

  it("zero piastres -> 0.00 ج.م", () => {
    expect(formatMoney2(0)).toBe("0.00 ج.م");
  });

  it("a negative amount carries a minus sign before the pounds, magnitude piastre-exact: -250 -> −2.50 ج.م", () => {
    expect(formatMoney2(-250)).toBe("−2.50 ج.م");
  });

  it("thousands separators apply to the pound part only, not across the decimal point", () => {
    expect(formatMoney2(1_000_000_00)).toBe("1,000,000.00 ج.م");
  });

  it("a non-integer piastre count (shouldn't happen, but never throws) truncates rather than rounding up a piastre it doesn't have", () => {
    expect(formatMoney2(199.9)).toBe("1.99 ج.م");
  });
});
