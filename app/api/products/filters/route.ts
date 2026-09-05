import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";

/** Category list + available sizes for a category rarely change; cached per categorySlug. */
const getFilters = unstable_cache(
  async (categorySlug: string | undefined) => {
    return Promise.all([
      prisma.category.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          _count: { select: { products: { where: { active: true } } } },
        },
      }),
      prisma.variant.findMany({
        where: {
          product: {
            active: true,
            ...(categorySlug ? { category: { slug: categorySlug } } : {}),
          },
        },
        select: { name: true },
      }),
    ]);
  },
  ["products-filters"],
  { revalidate: 300 }
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categorySlug = searchParams.get("category")?.trim() || undefined;

  const [categories, variants] = await getFilters(categorySlug);

  const sizes = [...new Set(variants.map((v) => v.name).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );

  return apiSuccess({
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      sortOrder: c.sortOrder,
      productCount: c._count.products,
    })),
    sizes,
  });
}
