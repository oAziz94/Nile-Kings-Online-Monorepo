import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";
import type { ProductListItem } from "@/lib/catalog";
import { piastresToEgp, discountPercentFromPrices, originalPriceFromExplicitDiscount } from "@/lib/catalog";
import {
  applyStorefrontPartnerStock,
  getStorefrontGovernorateFromRequest,
  getStorefrontStockContext,
} from "@/lib/storefront-location";

export const dynamic = "force-dynamic";

const HOME_LIMIT = 8;

function toListItem(p: {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  basePricePiastres: number | null;
  discountPricePiastres: number | null;
  category: { slug: string; name: string };
  variants: { id: string; pricePiastres: number; stockAvailable: number }[];
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
  };
}

export async function GET(req: NextRequest) {
  const stockContext = await getStorefrontStockContext(getStorefrontGovernorateFromRequest(req));
  const include = {
    category: { select: { slug: true, name: true } },
    variants: { select: { id: true, pricePiastres: true, stockAvailable: true } },
  } as const;

  const [categories, trendingIds, recommendedIds, newArrivals, allProducts] =
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
      prisma.addToCartLog
        .groupBy({
          by: ["variantId"],
          _count: { variantId: true },
          orderBy: { _count: { variantId: "desc" } },
          take: HOME_LIMIT * 3,
        })
        .then((rows) =>
          prisma.variant.findMany({
            where: { id: { in: rows.map((r) => r.variantId) } },
            select: { productId: true },
          })
        )
        .then((variants) => {
          const seen = new Set<string>();
          return variants.map((v) => v.productId).filter((id) => {
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
          }).slice(0, HOME_LIMIT);
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
    ]);

  const [stockAllProducts, stockNewArrivals] = await Promise.all([
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
  ]);

  const productMap = new Map(
    stockAllProducts.map((p) => [p.id, toListItem(p)])
  );

  const trending = trendingIds
    .map((r) => r.productId)
    .filter((id): id is string => id != null)
    .map((id) => productMap.get(id))
    .filter(Boolean) as ProductListItem[];

  const recommended = recommendedIds
    .map((id) => productMap.get(id))
    .filter(Boolean) as ProductListItem[];

  const newArrivalsList = stockNewArrivals.map(toListItem);

  const categoriesWithCount = categories.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    sortOrder: c.sortOrder,
    productCount: c._count.products,
  }));

  return apiSuccess({
    categories: categoriesWithCount,
    trending,
    recommended: recommended.length ? recommended : newArrivalsList.slice(0, HOME_LIMIT),
    newArrivals: newArrivalsList,
  });
}
