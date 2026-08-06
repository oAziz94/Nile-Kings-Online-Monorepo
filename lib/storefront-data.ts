import { prisma } from "@/lib/db";
import type { ProductListItem, ColorVariantListItem } from "@/lib/catalog";
import { piastresToEgp, discountPercentFromPrices, originalPriceFromExplicitDiscount } from "@/lib/catalog";
import {
  applyStorefrontPartnerStock,
  getCurrentStorefrontStockContext,
} from "@/lib/storefront-location";

const HOME_LIMIT = 8;

function toListItem(p: {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  basePricePiastres: number | null;
  discountPricePiastres: number | null;
  category: { slug: string; name: string };
  variants: {
    id: string;
    pricePiastres: number;
    stockAvailable: number;
    colorHex: string | null;
    colorName: string | null;
    imageUrl: string | null;
  }[];
}): ProductListItem {
  const prices = p.variants.map((v) => v.pricePiastres);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const currentPiastres = p.discountPricePiastres ?? minPrice;
  const priceEgp = piastresToEgp(currentPiastres);
  const originalPriceEgp = originalPriceFromExplicitDiscount(
    p.basePricePiastres,
    p.discountPricePiastres
  );
  const discountPercent = originalPriceEgp != null && originalPriceEgp > priceEgp
    ? discountPercentFromPrices(originalPriceEgp, priceEgp)
    : undefined;
  const inStock = p.variants.some((v) => v.stockAvailable > 0);

  const seen = new Set<string>();
  const colorVariants: ColorVariantListItem[] = [];
  for (const v of p.variants) {
    const key = v.colorHex ?? "default";
    if (seen.has(key)) continue;
    seen.add(key);
    colorVariants.push({
      id: v.id,
      colorHex: v.colorHex,
      colorName: v.colorName,
      imageUrl: v.imageUrl ?? p.imageUrl,
    });
  }

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    imageUrl: p.imageUrl,
    priceEgp,
    ...(originalPriceEgp && originalPriceEgp > priceEgp && { originalPriceEgp }),
    ...(discountPercent != null && { discountPercent }),
    categorySlug: p.category.slug,
    categoryName: p.category.name,
    inStock,
    ...(colorVariants.length > 0 && { colorVariants }),
  };
}

const include = {
  category: { select: { slug: true, name: true } },
  variants: {
    select: {
      id: true,
      pricePiastres: true,
      stockAvailable: true,
      colorHex: true,
      colorName: true,
      imageUrl: true,
    },
  },
} as const;

const BEST_SELLERS_LIMIT = 4;
/** Max products per collection carousel on homepage (women, kids, men). */
const COLLECTION_CAROUSEL_LIMIT = 16;

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
    const stockContext = await getCurrentStorefrontStockContext();
    const [categories, trendingRows, addToCartRows, newArrivals, allProducts, womenProducts, kidsProducts, menProducts] =
      await Promise.all([
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
          where: { active: true },
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

    const [
      stockAllProducts,
      stockNewArrivals,
      stockWomenProducts,
      stockKidsProducts,
      stockMenProducts,
    ] = await Promise.all([
      Promise.all(
        allProducts.map(async (product) => ({
          ...product,
          variants: await applyStorefrontPartnerStock(product.variants, stockContext.partnerId),
        }))
      ),
      Promise.all(
        newArrivals.map(async (product) => ({
          ...product,
          variants: await applyStorefrontPartnerStock(product.variants, stockContext.partnerId),
        }))
      ),
      Promise.all(
        womenProducts.map(async (product) => ({
          ...product,
          variants: await applyStorefrontPartnerStock(product.variants, stockContext.partnerId),
        }))
      ),
      Promise.all(
        kidsProducts.map(async (product) => ({
          ...product,
          variants: await applyStorefrontPartnerStock(product.variants, stockContext.partnerId),
        }))
      ),
      Promise.all(
        menProducts.map(async (product) => ({
          ...product,
          variants: await applyStorefrontPartnerStock(product.variants, stockContext.partnerId),
        }))
      ),
    ]);

    const productMap = new Map(stockAllProducts.map((p) => [p.id, toListItem(p)]));

    const trending = trendingRows
      .map((r) => r.productId)
      .filter((id): id is string => id != null)
      .map((id) => productMap.get(id))
      .filter((p): p is ProductListItem => Boolean(p));

    const recommendedProductIds = await (async () => {
      const variantIds = addToCartRows.map((r) => r.variantId);
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

    const recommended = recommendedProductIds
      .map((id) => productMap.get(id))
      .filter((p): p is ProductListItem => Boolean(p));

    // Best sellers: max 4, prefer recommended (add-to-cart) then trending then newArrivals
    const newArrivalsList = stockNewArrivals.map(toListItem);
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
      women: stockWomenProducts.map(toListItem),
      kids: stockKidsProducts.map(toListItem),
      men: stockMenProducts.map(toListItem),
    };

    return {
      categories: categories.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        productCount: c._count.products,
      })),
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
