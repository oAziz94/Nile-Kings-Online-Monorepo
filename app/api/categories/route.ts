import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 48;

/** Category list + product counts rarely change; cached instead of hitting the DB on every request. */
const getCategoriesPage = unstable_cache(
  async (limit: number, offset: number) => {
    return Promise.all([
      prisma.category.findMany({
        orderBy: { sortOrder: "asc" },
        skip: offset,
        take: limit,
        include: {
          _count: { select: { products: { where: { active: true } } } },
        },
      }),
      prisma.category.count(),
    ]);
  },
  ["categories-page"],
  { revalidate: 300 }
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(
    Number(searchParams.get("limit")) || DEFAULT_LIMIT,
    MAX_LIMIT
  );
  const offset = Number(searchParams.get("offset")) || 0;

  const [list, total] = await getCategoriesPage(limit, offset);

  const categories = list.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    sortOrder: c.sortOrder,
    productCount: c._count.products,
  }));

  return apiSuccess({ categories, total });
}
