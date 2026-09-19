import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { apiSuccess, apiNotFound } from "@/lib/api/response";
import { piastresToEgp } from "@/lib/catalog";
import { CATALOG_TAG, CATEGORIES_TAG } from "@/lib/cache/catalog-tags";

/** Category filter facets (sizes/price range/stock) rarely change; cached per category slug. */
const getCategoryFilters = unstable_cache(
  async (slug: string) => {
    const category = await prisma.category.findFirst({
      where: { slug },
      select: { id: true },
    });
    if (!category) return null;

    // backlog 9.8b review fix — an invisible colour's sizes/prices must not leak into the
    // category's filter facets (its variants are inactive together, same as everywhere else
    // the storefront reads variants).
    const variants = await prisma.variant.findMany({
      where: { active: true, product: { categoryId: category.id, active: true } },
      select: { id: true, name: true, pricePiastres: true },
    });
    // Stock lives only in PartnerInventory now (backlog 9.9) — one grouped, network-wide check
    // for whether any of this category's variants has sellable stock with any partner, never a
    // per-variant read and never a governorate-scoped figure (this facet is category-wide, not
    // per-visitor).
    const hasInStock = variants.length
      ? (
          await prisma.partnerInventory.groupBy({
            by: ["variantId"],
            where: { variantId: { in: variants.map((v) => v.id) } },
            _sum: { stockAvailable: true, stockReserved: true },
          })
        ).some((g) => (g._sum.stockAvailable ?? 0) - (g._sum.stockReserved ?? 0) > 0)
      : false;
    return { variants, hasInStock };
  },
  ["category-filters"],
  { revalidate: 300, tags: [CATALOG_TAG, CATEGORIES_TAG] }
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const result = await getCategoryFilters(slug);
  if (!result) return apiNotFound("التصنيف غير موجود");
  const { variants, hasInStock } = result;

  const sizes = [...new Set(variants.map((v) => v.name))].sort();
  const prices = variants.map((v) => piastresToEgp(v.pricePiastres));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  return apiSuccess({
    sizes,
    minPrice,
    maxPrice,
    hasInStock,
  });
}
