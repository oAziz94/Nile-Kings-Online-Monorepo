import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";
import type { ProductListItem } from "@/lib/catalog";
import { piastresToEgp, discountPercentFromPrices } from "@/lib/catalog";

export const dynamic = "force-dynamic";

const RECOMMENDATIONS_LIMIT = 12;

function toListItem(p: {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  basePricePiastres: number | null;
  discountPricePiastres: number | null;
  category: { slug: string; name: string };
  variants: { pricePiastres: number; stockAvailable: number }[];
}): ProductListItem {
  const prices = p.variants.map((v) => v.pricePiastres);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const currentPiastres = p.discountPricePiastres ?? minPrice;
  const priceEgp = piastresToEgp(currentPiastres);
  const originalFromProduct =
    p.basePricePiastres != null && p.basePricePiastres > currentPiastres
      ? piastresToEgp(p.basePricePiastres)
      : undefined;
  const originalFromVariants =
    maxPrice > minPrice ? piastresToEgp(maxPrice) : undefined;
  const originalPriceEgp = originalFromProduct ?? originalFromVariants;
  const discountPercent =
    originalPriceEgp != null && originalPriceEgp > priceEgp
      ? discountPercentFromPrices(originalPriceEgp, priceEgp)
      : undefined;
  const inStock = p.variants.some((v) => v.stockAvailable > 0);

  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    imageUrl: p.imageUrl,
    priceEgp,
    ...(originalPriceEgp &&
      originalPriceEgp > priceEgp && { originalPriceEgp }),
    ...(discountPercent != null && { discountPercent }),
    categorySlug: p.category.slug,
    categoryName: p.category.name,
    inStock,
  };
}

export async function GET(_req: NextRequest) {
  const include = {
    category: { select: { slug: true, name: true } },
    variants: { select: { pricePiastres: true, stockAvailable: true } },
  } as const;

  const [trendingIds, recommendedIds, newArrivals, allProducts] =
    await Promise.all([
      prisma.viewLog.groupBy({
        by: ["productId"],
        where: { productId: { not: null } },
        _count: { productId: true },
        orderBy: { _count: { productId: "desc" } },
        take: RECOMMENDATIONS_LIMIT,
      }),
      prisma.addToCartLog
        .groupBy({
          by: ["variantId"],
          _count: { variantId: true },
          orderBy: { _count: { variantId: "desc" } },
          take: RECOMMENDATIONS_LIMIT * 3,
        })
        .then((rows) =>
          prisma.variant.findMany({
            where: { id: { in: rows.map((r) => r.variantId) } },
            select: { productId: true },
          })
        )
        .then((variants) => {
          const seen = new Set<string>();
          return variants
            .map((v) => v.productId)
            .filter((id) => {
              if (seen.has(id)) return false;
              seen.add(id);
              return true;
            })
            .slice(0, RECOMMENDATIONS_LIMIT);
        }),
      prisma.product.findMany({
        where: { active: true },
        orderBy: { createdAt: "desc" },
        take: RECOMMENDATIONS_LIMIT,
        include,
      }),
      prisma.product.findMany({
        where: { active: true },
        include,
      }),
    ]);

  const productMap = new Map(
    allProducts.map((p) => [p.id, toListItem(p)])
  );

  const trending = trendingIds
    .map((r) => r.productId)
    .filter((id): id is string => id != null)
    .map((id) => productMap.get(id))
    .filter(Boolean) as ProductListItem[];

  const recommended = recommendedIds
    .map((id) => productMap.get(id))
    .filter(Boolean) as ProductListItem[];

  const newArrivalsList = newArrivals.map(toListItem);

  const fallback =
    recommended.length > 0 ? recommended : newArrivalsList.slice(0, RECOMMENDATIONS_LIMIT);
  const seen = new Set<string>();
  const products: ProductListItem[] = [];
  for (const p of [...fallback, ...trending, ...newArrivalsList]) {
    if (products.length >= RECOMMENDATIONS_LIMIT) break;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    products.push(p);
  }

  return apiSuccess({ products });
}
