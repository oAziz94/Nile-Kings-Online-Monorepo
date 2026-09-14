import { describe, it, expect, vi } from "vitest";

type ProductRow = { id: string; name: string; heroAssetId: string | null; imageUrl: string | null };
type VariantRow = {
  id: string;
  productId: string;
  colorName: string | null;
  imageAssetId: string | null;
  imageUrl: string | null;
  product: { name: string };
};
type VariantImageRow = {
  id: string;
  productId: string;
  colorKey: string;
  assetId: string | null;
  url: string;
  sortOrder: number;
  product: { name: string };
};
type RoutedOrderRow = { id: string; orderId: string; proofImagePublicId: string | null };

type WhereIn = { OR: [{ heroAssetId: { in: string[] } } | { imageAssetId: { in: string[] } } | { assetId: { in: string[] } }, { imageUrl: { in: string[] } } | { url: { in: string[] } }] };
type ProofWhere = { proofImagePublicId: { in: string[] } };

const fakeDb = {
  products: [] as ProductRow[],
  variants: [] as VariantRow[],
  variantImages: [] as VariantImageRow[],
  routedOrders: [] as RoutedOrderRow[],

  product: {
    findMany: async ({ where }: { where: WhereIn }) => {
      const ids: string[] = (where.OR[0] as { heroAssetId: { in: string[] } }).heroAssetId.in;
      const urls: string[] = (where.OR[1] as { imageUrl: { in: string[] } }).imageUrl.in;
      return fakeDb.products.filter(
        (p) => (p.heroAssetId && ids.includes(p.heroAssetId)) || (p.imageUrl && urls.includes(p.imageUrl))
      );
    },
  },
  variant: {
    findMany: async ({ where }: { where: WhereIn }) => {
      const ids: string[] = (where.OR[0] as { imageAssetId: { in: string[] } }).imageAssetId.in;
      const urls: string[] = (where.OR[1] as { imageUrl: { in: string[] } }).imageUrl.in;
      return fakeDb.variants.filter(
        (v) => (v.imageAssetId && ids.includes(v.imageAssetId)) || (v.imageUrl && urls.includes(v.imageUrl))
      );
    },
  },
  variantImage: {
    findMany: async ({ where }: { where: WhereIn }) => {
      const ids: string[] = (where.OR[0] as { assetId: { in: string[] } }).assetId.in;
      const urls: string[] = (where.OR[1] as { url: { in: string[] } }).url.in;
      return fakeDb.variantImages.filter((vi_) => (vi_.assetId && ids.includes(vi_.assetId)) || urls.includes(vi_.url));
    },
  },
  routedOrder: {
    findMany: async ({ where }: { where: ProofWhere }) => {
      const ids: string[] = where.proofImagePublicId.in;
      return fakeDb.routedOrders.filter((r) => r.proofImagePublicId && ids.includes(r.proofImagePublicId));
    },
  },
};

vi.mock("@/lib/db", () => ({
  get prisma() {
    return fakeDb;
  },
}));

const { getAssetUsage, summarizeUsage } = await import("./usage");

describe("getAssetUsage", () => {
  it("matches by asset id first", () => {
    fakeDb.products = [{ id: "p1", name: "تي شيرت", heroAssetId: "asset-1", imageUrl: "https://x/other.jpg" }];
    fakeDb.variants = [];
    fakeDb.variantImages = [];
    fakeDb.routedOrders = [];

    return getAssetUsage([{ id: "asset-1", url: "https://x/a.jpg", publicId: "products/a" }]).then((usage) => {
      const entries = usage.get("asset-1");
      expect(entries).toHaveLength(1);
      expect(entries?.[0]).toMatchObject({ kind: "product_hero", productId: "p1" });
    });
  });

  it("falls back to URL match for legacy rows with no id column set", async () => {
    fakeDb.products = [{ id: "p2", name: "بيجامة", heroAssetId: null, imageUrl: "https://x/legacy.jpg" }];
    fakeDb.variants = [];
    fakeDb.variantImages = [];
    fakeDb.routedOrders = [];

    const usage = await getAssetUsage([
      { id: "asset-2", url: "https://x/legacy.jpg", publicId: "products/legacy" },
    ]);
    const entries = usage.get("asset-2");
    expect(entries).toHaveLength(1);
    expect(entries?.[0]).toMatchObject({ kind: "product_hero", productId: "p2" });
  });

  it("collects gallery and proof usage, and leaves an unused asset out of the map", async () => {
    fakeDb.products = [];
    fakeDb.variants = [];
    fakeDb.variantImages = [
      {
        id: "vi1",
        productId: "p3",
        colorKey: "أسود|#000000",
        assetId: "asset-3",
        url: "https://x/gallery.jpg",
        sortOrder: 1,
        product: { name: "طقم" },
      },
    ];
    fakeDb.routedOrders = [{ id: "ro1", orderId: "order-abcdefgh1234", proofImagePublicId: "routed-proofs/xyz" }];

    const usage = await getAssetUsage([
      { id: "asset-3", url: "https://x/gallery.jpg", publicId: "products/gallery" },
      { id: "asset-4", url: "https://x/proof.jpg", publicId: "routed-proofs/xyz" },
      { id: "asset-5", url: "https://x/unused.jpg", publicId: "products/unused" },
    ]);

    expect(usage.get("asset-3")).toMatchObject([{ kind: "gallery", sortOrder: 1, productId: "p3" }]);
    expect(usage.get("asset-4")).toMatchObject([{ kind: "proof", routedOrderId: "ro1" }]);
    expect(usage.get("asset-5")).toBeUndefined();
  });
});

describe("summarizeUsage", () => {
  it("says غير مسندة when no entries", () => {
    expect(summarizeUsage([])).toBe("غير مسندة");
  });

  it("names product, colour and role", () => {
    const text = summarizeUsage([
      { kind: "gallery", productId: "p1", productName: "طقم", colorKey: "أبيض|", colorName: "أبيض", sortOrder: 0, variantImageId: "vi1" },
    ]);
    expect(text).toBe("طقم · أبيض · معرض 1");
  });
});
