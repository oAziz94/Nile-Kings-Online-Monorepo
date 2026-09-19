import { describe, expect, it, vi } from "vitest";

/**
 * Asserts the exact tag names each helper revalidates (backlog 6.3) — `next/cache` mocked to a
 * spy, same pattern as `lib/settings.test.ts`.
 */
const revalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (tag: string) => revalidateTag(tag),
}));

const {
  CATALOG_TAG,
  CATEGORIES_TAG,
  MENU_TAG,
  REROUTING_RULES_TAG,
  productTag,
  revalidateCatalog,
  revalidateCategories,
  revalidateMenu,
  revalidateReroutingRules,
} = await import("./catalog-tags");

describe("catalog-tags", () => {
  it("productTag namespaces by slug", () => {
    expect(productTag("shirt-1")).toBe("catalog:product:shirt-1");
    expect(productTag("shirt-2")).toBe("catalog:product:shirt-2");
  });

  it("revalidateCatalog revalidates only the broad tag when no slugs are given", () => {
    revalidateTag.mockClear();
    revalidateCatalog();
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(CATALOG_TAG);
  });

  it("revalidateCatalog also revalidates each product's own tag when slugs are given", () => {
    revalidateTag.mockClear();
    revalidateCatalog({ productSlugs: ["shirt-1", "shirt-2"] });
    expect(revalidateTag).toHaveBeenCalledTimes(3);
    expect(revalidateTag).toHaveBeenNthCalledWith(1, CATALOG_TAG);
    expect(revalidateTag).toHaveBeenNthCalledWith(2, "catalog:product:shirt-1");
    expect(revalidateTag).toHaveBeenNthCalledWith(3, "catalog:product:shirt-2");
  });

  it("revalidateCategories revalidates categories and menu (categories drive the menu)", () => {
    revalidateTag.mockClear();
    revalidateCategories();
    expect(revalidateTag).toHaveBeenCalledTimes(2);
    expect(revalidateTag).toHaveBeenNthCalledWith(1, CATEGORIES_TAG);
    expect(revalidateTag).toHaveBeenNthCalledWith(2, MENU_TAG);
  });

  it("revalidateMenu revalidates only the menu tag", () => {
    revalidateTag.mockClear();
    revalidateMenu();
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(MENU_TAG);
  });

  it("revalidateReroutingRules revalidates only the rerouting-rules tag", () => {
    revalidateTag.mockClear();
    revalidateReroutingRules();
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith(REROUTING_RULES_TAG);
  });
});
