import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";
import type { ProductListItem } from "@/lib/catalog";
import { piastresToEgp, discountPercentFromPrices, originalPriceFromExplicitDiscount } from "@/lib/catalog";
import {
  applyPartnerStockOverrides,
  getPartnerStockOverrides,
  getStorefrontGovernorateFromRequest,
  getStorefrontStockContext,
} from "@/lib/storefront-location";

const RELATED_LIMIT = 4;

/** Related-products catalog query cached per slug — partner stock is applied after the cache read. */
const getRelatedCatalog = unstable_cache(
  async (slug: string) => {
    const product = await prisma.product.findFirst({
      where: { slug, active: true },
      select: { id: true, categoryId: true },
    });
    if (!product) return null;

    const related = await prisma.product.findMany({
      where: {
        active: true,
        categoryId: product.categoryId,
        id: { not: product.id },
      },
      orderBy: { sortOrder: "asc" },
      take: RELATED_LIMIT,
      include: {
        category: { select: { slug: true, name: true } },
        variants: { select: { id: true, pricePiastres: true, stockAvailable: true } },
      },
    });
    return related;
  },
  ["products-related"],
  { revalidate: 300 }
);

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const stockContext = await getStorefrontStockContext(getStorefrontGovernorateFromRequest(req));

  const related = await getRelatedCatalog(slug);
  if (!related) {
    return apiSuccess({ products: [] });
  }

  const allVariantIds = related.flatMap((p) => p.variants.map((v) => v.id));
  const overrides = await getPartnerStockOverrides(allVariantIds, stockContext.partnerId);
  const stockAdjustedRelated = related.map((product) => ({
    ...product,
    variants: applyPartnerStockOverrides(product.variants, overrides),
  }));

  return apiSuccess({ products: stockAdjustedRelated.map(toListItem) });
}
