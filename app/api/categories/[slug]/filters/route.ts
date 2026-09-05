import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { apiSuccess, apiNotFound } from "@/lib/api/response";
import { piastresToEgp } from "@/lib/catalog";

/** Category filter facets (sizes/price range/stock) rarely change; cached per category slug. */
const getCategoryFilters = unstable_cache(
  async (slug: string) => {
    const category = await prisma.category.findFirst({
      where: { slug },
      select: { id: true },
    });
    if (!category) return null;

    const variants = await prisma.variant.findMany({
      where: { product: { categoryId: category.id, active: true } },
      select: { name: true, pricePiastres: true, stockAvailable: true },
    });
    return variants;
  },
  ["category-filters"],
  { revalidate: 300 }
);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const variants = await getCategoryFilters(slug);
  if (!variants) return apiNotFound("التصنيف غير موجود");

  const sizes = [...new Set(variants.map((v) => v.name))].sort();
  const prices = variants.map((v) => piastresToEgp(v.pricePiastres));
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  return apiSuccess({
    sizes,
    minPrice,
    maxPrice,
    hasInStock: variants.some((v) => v.stockAvailable > 0),
  });
}
