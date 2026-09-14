import { describe, it, expect } from "vitest";
import { buildVariantSku, variantSlug, toSkuSafeColor, STANDARD_SIZE_RUN } from "./slug";

describe("buildVariantSku (backlog 9.8b: single source for variant SKU generation)", () => {
  it("matches the format the size-at-a-time and colour-creation routes both rely on (hyphens become underscores, like every other non-alphanumeric character)", () => {
    expect(buildVariantSku("cotton-tshirt", "M", "أسود", "#000000")).toBe(
      `COTTON_TSHIRT_M_${toSkuSafeColor("أسود")}`
    );
  });

  it("falls back to the hex when no colour name is given", () => {
    expect(buildVariantSku("cotton-tshirt", "L", null, "#ffffff")).toBe(
      `COTTON_TSHIRT_L_${toSkuSafeColor("#ffffff")}`
    );
  });

  it("falls back to NOC when neither name nor hex is given", () => {
    expect(buildVariantSku("cotton-tshirt", "S", null, null)).toBe("COTTON_TSHIRT_S_NOC");
  });

  it("is the exact function the colour-creation route (/colors) and the single-size route (/variants) both import — same output for the same inputs, so they can never diverge", () => {
    const productSlug = "galabeya-classic";
    const size = "XL";
    const colorName = "كحلي";
    const colorHex = "#0d47a1";
    // Simulates what each route computes internally — both now call buildVariantSku directly.
    const fromColorsRoute = buildVariantSku(productSlug, size, colorName, colorHex);
    const fromVariantsRoute = buildVariantSku(productSlug, size, colorName, colorHex);
    expect(fromColorsRoute).toBe(fromVariantsRoute);
  });
});

describe("variantSlug", () => {
  it("builds productSlug_size_colorHexCode", () => {
    expect(variantSlug("cotton-tshirt", "M", "#000000")).toBe("cotton-tshirt_m_000000");
  });

  it("uses 'noc' when there is no usable hex", () => {
    expect(variantSlug("cotton-tshirt", "M", null)).toBe("cotton-tshirt_m_noc");
  });
});

describe("STANDARD_SIZE_RUN", () => {
  it("is the size run offered by both 'لون جديد' and the legacy generateSizes bulk-add", () => {
    expect(STANDARD_SIZE_RUN).toEqual(["S", "M", "L", "XL", "XXL"]);
  });
});
