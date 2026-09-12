import { describe, it, expect } from "vitest";
import { friendlyVariantLabel } from "./variant-label";

describe("friendlyVariantLabel", () => {
  it("includes size and color when both are present", () => {
    expect(
      friendlyVariantLabel({ size: "M", colorName: "أسود", variantName: "cotton-tshirt-M-أسود" })
    ).toBe("المقاس M · أسود");
  });

  it("omits the color part when colorName is null", () => {
    expect(
      friendlyVariantLabel({ size: "L", colorName: null, variantName: "cotton-tshirt-L" })
    ).toBe("المقاس L");
  });

  it("omits the color part when colorName is an empty/whitespace string", () => {
    expect(
      friendlyVariantLabel({ size: "L", colorName: "   ", variantName: "cotton-tshirt-L" })
    ).toBe("المقاس L");
  });

  it("falls back to variantName when size is missing", () => {
    expect(
      friendlyVariantLabel({ size: null, colorName: "أسود", variantName: "cotton-tshirt-M-أسود" })
    ).toBe("cotton-tshirt-M-أسود");
  });

  it("falls back to variantName when size is undefined (payload fields absent)", () => {
    expect(friendlyVariantLabel({ variantName: "cotton-tshirt-M-أسود" })).toBe(
      "cotton-tshirt-M-أسود"
    );
  });

  it("falls back to variantName when size is an empty/whitespace string", () => {
    expect(
      friendlyVariantLabel({ size: "   ", colorName: "أسود", variantName: "cotton-tshirt-M-أسود" })
    ).toBe("cotton-tshirt-M-أسود");
  });
});
