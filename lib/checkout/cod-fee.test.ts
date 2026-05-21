import { describe, it, expect } from "vitest";
import { computeCodFeePiastres, COD_FEE_MIN_PIASTRES } from "./cod-fee";

describe("computeCodFeePiastres", () => {
  it("returns 0 when percent is 0", () => {
    expect(computeCodFeePiastres(50_000, 0)).toBe(0);
  });

  it("uses percent when above minimum", () => {
    expect(computeCodFeePiastres(50_000, 2)).toBe(1000);
  });

  it("floors to 5 EGP when percent is below minimum", () => {
    expect(computeCodFeePiastres(30_000, 1)).toBe(COD_FEE_MIN_PIASTRES);
    expect(computeCodFeePiastres(10_000, 2)).toBe(COD_FEE_MIN_PIASTRES);
  });
});
