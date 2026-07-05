import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categorySlug = searchParams.get("category")?.trim();

  const [categories, variants] = await Promise.all([
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
