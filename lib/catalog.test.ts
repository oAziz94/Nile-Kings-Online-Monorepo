import { describe, it, expect } from "vitest";
import { buildProductListItem, type ProductListItemInput } from "./catalog";

const baseProduct: Omit<ProductListItemInput, "variants"> = {
  id: "p1",
  name: "Cotton T-Shirt",
  slug: "cotton-tshirt",
  imageUrl: "https://example.com/product.jpg",
  basePricePiastres: null,
  discountPricePiastres: null,
  category: { slug: "men", name: "رجالي" },
};

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

describe("buildProductListItem", () => {
  it("returns exactly one card per product regardless of how many colors/sizes it has", () => {
    const item = buildProductListItem({
      ...baseProduct,
      variants: [
        { id: "v1", pricePiastres: 10000, stockAvailable: 5, colorHex: "#000", colorName: "أسود" },
        { id: "v2", pricePiastres: 10000, stockAvailable: 5, colorHex: "#000", colorName: "أسود" },
        { id: "v3", pricePiastres: 10000, stockAvailable: 3, colorHex: "#fff", colorName: "أبيض" },
      ],
    });
    expect(item.id).toBe("p1");
    expect(item.colorVariants).toHaveLength(2);
  });

  it("leads with the color that has the most total stock across its sizes", () => {
    const item = buildProductListItem({
      ...baseProduct,
      variants: [
        // Black: 2 + 1 = 3 units total
        { id: "black-s", slug: "tshirt_s_000", pricePiastres: 10000, stockAvailable: 2, colorHex: "#000", colorName: "أسود", imageUrl: "black.jpg" },
        { id: "black-m", slug: "tshirt_m_000", pricePiastres: 10000, stockAvailable: 1, colorHex: "#000", colorName: "أسود", imageUrl: "black.jpg" },
        // White: 10 units total — should win
        { id: "white-m", slug: "tshirt_m_fff", pricePiastres: 12000, stockAvailable: 10, colorHex: "#fff", colorName: "أبيض", imageUrl: "white.jpg" },
      ],
    });
    expect(item.imageUrl).toBe("white.jpg");
    expect(item.variantSlug).toBe("tshirt_m_fff");
    expect(item.priceEgp).toBe(120); // min price among the winning color's own sizes
  });

  it("breaks a stock tie toward the earliest-added color, deterministically", () => {
    const item = buildProductListItem({
      ...baseProduct,
      variants: [
        { id: "red", slug: "tshirt_m_red", pricePiastres: 10000, stockAvailable: 5, colorHex: "#f00", colorName: "أحمر", imageUrl: "red.jpg", createdAt: new Date(now - 1 * DAY) },
        { id: "blue", slug: "tshirt_m_blue", pricePiastres: 10000, stockAvailable: 5, colorHex: "#00f", colorName: "أزرق", imageUrl: "blue.jpg", createdAt: new Date(now - 5 * DAY) },
      ],
    });
    expect(item.imageUrl).toBe("blue.jpg");
    expect(item.variantSlug).toBe("tshirt_m_blue");
  });

  it("never picks a fully out-of-stock color as the default while another color still has stock", () => {
    const item = buildProductListItem({
      ...baseProduct,
      variants: [
        { id: "sold-out", slug: "tshirt_m_a", pricePiastres: 10000, stockAvailable: 0, colorHex: "#111", colorName: "غامق", imageUrl: "dark.jpg" },
        { id: "in-stock", slug: "tshirt_m_b", pricePiastres: 10000, stockAvailable: 1, colorHex: "#222", colorName: "فاتح", imageUrl: "light.jpg" },
      ],
    });
    expect(item.imageUrl).toBe("light.jpg");
    expect(item.inStock).toBe(true);
  });

  it("falls back to the product's own image/slug when there are no variants", () => {
    const item = buildProductListItem({ ...baseProduct, variants: [] });
    expect(item.imageUrl).toBe(baseProduct.imageUrl);
    expect(item.variantSlug).toBeUndefined();
    expect(item.colorVariants).toBeUndefined();
    expect(item.inStock).toBe(false);
  });
});
