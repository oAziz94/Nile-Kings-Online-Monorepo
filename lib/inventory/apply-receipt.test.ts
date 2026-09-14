import { describe, expect, it } from "vitest";
import { mergeReceiptLines, parseReceiptLines } from "./apply-receipt";

describe("parseReceiptLines", () => {
  it("rejects an empty array", () => {
    expect(parseReceiptLines([])).toBeNull();
  });

  it("rejects a non-array", () => {
    expect(parseReceiptLines("not-an-array")).toBeNull();
  });

  it("rejects a line missing variantId or a non-integer quantity", () => {
    expect(parseReceiptLines([{ quantity: 5 }])).toBeNull();
    expect(parseReceiptLines([{ variantId: "v1", quantity: 1.5 }])).toBeNull();
  });

  it("parses valid lines", () => {
    expect(parseReceiptLines([{ variantId: "v1", quantity: 5 }])).toEqual([{ variantId: "v1", quantity: 5 }]);
  });
});

describe("mergeReceiptLines", () => {
  it("FACTORY: sums duplicate variantIds (additive delivery)", () => {
    const merged = mergeReceiptLines(
      [
        { variantId: "v1", quantity: 3 },
        { variantId: "v1", quantity: 2 },
        { variantId: "v2", quantity: 1 },
      ],
      "FACTORY"
    );
    expect(merged).toEqual(
      expect.arrayContaining([
        { variantId: "v1", quantity: 5 },
        { variantId: "v2", quantity: 1 },
      ])
    );
  });

  it("COUNT: last occurrence wins (a physical count is one fact, not additive)", () => {
    const merged = mergeReceiptLines(
      [
        { variantId: "v1", quantity: 3 },
        { variantId: "v1", quantity: 7 },
      ],
      "COUNT"
    );
    expect(merged).toEqual([{ variantId: "v1", quantity: 7 }]);
  });
});
