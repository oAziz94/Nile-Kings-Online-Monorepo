import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import type { ProductListItem } from "@/lib/catalog";
import { buildProductListItem } from "@/lib/catalog";
import {
  applyPartnerStockOverrides,
  getCurrentStorefrontStockContext,
  getPartnerStockOverrides,
} from "@/lib/storefront-location";

const HOME_LIMIT = 8;

type RawProduct = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  basePricePiastres: number | null;
  discountPricePiastres: number | null;
  category: { slug: string; name: string };
  variants: {
    id: string;
    slug: string | null;
    pricePiastres: number;
    stockAvailable: number;
    colorHex: string | null;
    colorName: string | null;
    imageUrl: string | null;
    /** From `unstable_cache`: a fresh query returns a Date, a cache-hit returns its JSON-serialized ISO string. */
    createdAt: Date | string;
  }[];
};

const toListItem = buildProductListItem;

const include = {
  category: { select: { slug: true, name: true } },
  variants: {
    select: {
      id: true,
      slug: true,
      pricePiastres: true,
      stockAvailable: true,
      colorHex: true,
      colorName: true,
      imageUrl: true,
      createdAt: true,
    },
  },
} as const;

const BEST_SELLERS_LIMIT = 4;
/** Max products per collection carousel on homepage (women, kids, men). */
const COLLECTION_CAROUSEL_LIMIT = 16;
/** How long the cookie-independent part of the homepage catalog may be stale for. */
const HOME_CATALOG_REVALIDATE_SECONDS = 300;

type HomeCatalogData = {
  categories: { id: string; name: string; slug: string; productCount: number }[];
  trendingIds: string[];
  recommendedProductIds: string[];
  relevantProducts: RawProduct[];
  newArrivals: RawProduct[];
  women: RawProduct[];
  kids: RawProduct[];
  men: RawProduct[];
};

/**
 * Everything on the homepage that does NOT depend on the visitor's storefront
 * governorate cookie. Cached across visitors so the underlying catalog
 * queries run at most once per revalidate window instead of on every request.
 */
const getHomeCatalogData = unstable_cache(
  async (): Promise<HomeCatalogData> => {
    const [categories, trendingRows, addToCartRows, newArrivals, women, kids, men] = await Promise.all([
      prisma.category.findMany({
        orderBy: { sortOrder: "asc" },
        include: { _count: { select: { products: { where: { active: true } } } } },
      }),
      prisma.viewLog.groupBy({
        by: ["productId"],
        where: { productId: { not: null } },
        _count: { productId: true },
        orderBy: { _count: { productId: "desc" } },
        take: HOME_LIMIT,
      }),
      prisma.addToCartLog.groupBy({
        by: ["variantId"],
        _count: { variantId: true },
        orderBy: { _count: { variantId: "desc" } },
        take: HOME_LIMIT * 3,
      }),
      prisma.product.findMany({
        where: { active: true },
        orderBy: { createdAt: "desc" },
        take: HOME_LIMIT,
        include,
      }),
      prisma.product.findMany({
        where: { active: true, category: { slug: "women" } },
        orderBy: { createdAt: "desc" },
        take: COLLECTION_CAROUSEL_LIMIT,
        include,
      }),
      prisma.product.findMany({
        where: { active: true, category: { slug: "kids" } },
        orderBy: { createdAt: "desc" },
        take: COLLECTION_CAROUSEL_LIMIT,
        include,
      }),
      prisma.product.findMany({
        where: { active: true, category: { slug: "men" } },
        orderBy: { createdAt: "desc" },
        take: COLLECTION_CAROUSEL_LIMIT,
        include,
      }),
    ]);

    const trendingIds = trendingRows
      .map((r) => r.productId)
      .filter((id): id is string => id != null);

    const recommendedProductIds = await (async () => {
      const variantIds = addToCartRows.map((r) => r.variantId);
      if (variantIds.length === 0) return [];
      const variants = await prisma.variant.findMany({
        where: { id: { in: variantIds } },
        select: { productId: true },
      });
      const seen = new Set<string>();
      return variants.map((v) => v.productId).filter((id) => {
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      }).slice(0, HOME_LIMIT);
    })();

    const relevantIds = Array.from(new Set([...trendingIds, ...recommendedProductIds]));
    const relevantProducts = relevantIds.length
      ? await prisma.product.findMany({
          where: { id: { in: relevantIds }, active: true },
          include,
        })
      : [];

    return {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        productCount: c._count.products,
      })),
      trendingIds,
      recommendedProductIds,
      relevantProducts,
      newArrivals,
      women,
      kids,
      men,
    };
  },
  ["home-catalog-data"],
  { revalidate: HOME_CATALOG_REVALIDATE_SECONDS }
);

export async function getHomeData(): Promise<{
  categories: { id: string; name: string; slug: string; productCount: number }[];
  trending: ProductListItem[];
  recommended: ProductListItem[];
  newArrivals: ProductListItem[];
  bestSellers: ProductListItem[];
  collectionProducts: {
    women: ProductListItem[];
    kids: ProductListItem[];
    men: ProductListItem[];
  };
} | null> {
  try {
    const [stockContext, catalog] = await Promise.all([
      getCurrentStorefrontStockContext(),
      getHomeCatalogData(),
    ]);

    // One batched partner-stock lookup for every variant across every homepage list,
    // instead of one query per product.
    const allVariantIds = Array.from(
      new Set(
        [...catalog.relevantProducts, ...catalog.newArrivals, ...catalog.women, ...catalog.kids, ...catalog.men].flatMap(
          (p) => p.variants.map((v) => v.id)
        )
      )
    );
    const overrides = await getPartnerStockOverrides(allVariantIds, stockContext.partnerId);
    const withStock = (products: RawProduct[]) =>
      products.map((p) => ({ ...p, variants: applyPartnerStockOverrides(p.variants, overrides) }));

    const productMap = new Map(withStock(catalog.relevantProducts).map((p) => [p.id, toListItem(p)]));

    const trending = catalog.trendingIds
      .map((id) => productMap.get(id))
      .filter((p): p is ProductListItem => Boolean(p));

    const recommended = catalog.recommendedProductIds
      .map((id) => productMap.get(id))
      .filter((p): p is ProductListItem => Boolean(p));

    // Best sellers: max 4, prefer recommended (add-to-cart) then trending then newArrivals
    const newArrivalsList = withStock(catalog.newArrivals).map(toListItem);
    const fallbackRecommended = recommended.length ? recommended : newArrivalsList.slice(0, HOME_LIMIT);
    const seenIds = new Set<string>();
    const bestSellers: ProductListItem[] = [];
    for (const p of [...fallbackRecommended, ...trending, ...newArrivalsList]) {
      if (bestSellers.length >= BEST_SELLERS_LIMIT) break;
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        bestSellers.push(p);
      }
    }

    const collectionProducts = {
      women: withStock(catalog.women).map(toListItem),
      kids: withStock(catalog.kids).map(toListItem),
      men: withStock(catalog.men).map(toListItem),
    };

    return {
      categories: catalog.categories,
      trending,
      recommended: fallbackRecommended,
      newArrivals: newArrivalsList,
      bestSellers,
      collectionProducts,
    };
  } catch {
    return null;
  }
}
