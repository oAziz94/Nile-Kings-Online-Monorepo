import { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";
import { apiSuccess } from "@/lib/api/response";
import type { MenuSection } from "@/lib/menu-config";

export const dynamic = "force-dynamic";

const CATEGORY_SLUGS = ["men", "women", "kids"] as const;
const LABELS: Record<(typeof CATEGORY_SLUGS)[number], string> = {
  men: "كولكشن رجالي",
  women: "كولكشن حريمي",
  kids: "كولكشن اطفال",
};

/**
 * Menu sections (تصنيف categories + tags) rarely change, so this is cached for 5 minutes
 * instead of hitting the DB on every request — the nav renders on effectively every page load.
 */
const getMenuSections = unstable_cache(
  async (): Promise<MenuSection[]> => {
    const categories = await prisma.category.findMany({
      where: { slug: { in: [...CATEGORY_SLUGS] } },
      select: { id: true, slug: true },
    });
    const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));
    const categoryIds = categories.map((c) => c.id);

    const products = categoryIds.length
      ? await prisma.product.findMany({
          where: { categoryId: { in: categoryIds }, active: true },
          select: { categoryId: true, tags: true },
        })
      : [];

    const tagsByCategoryId = new Map<string, string[]>();
    for (const p of products) {
      const arr = tagsByCategoryId.get(p.categoryId) ?? [];
      arr.push(...p.tags);
      tagsByCategoryId.set(p.categoryId, arr);
    }

    return CATEGORY_SLUGS.map((slug) => {
      const baseHref = `/categories/${slug}`;
      const children: MenuSection["children"] = [
        { labelAr: "الكل", href: baseHref },
        { labelAr: "الاكثر مبيعا", href: `${baseHref}?sort=best_sales` },
      ];

      const categoryId = categoryIdBySlug.get(slug);
      if (categoryId) {
        const allTags = (tagsByCategoryId.get(categoryId) ?? []).filter(Boolean);
        const uniqueTags = [...new Set(allTags)].sort((a, b) => a.localeCompare(b, "ar"));
        for (const tag of uniqueTags) {
          children.push({
            labelAr: tag,
            sectionSlug: tag,
            href: `${baseHref}?section=${encodeURIComponent(tag)}`,
          });
        }
      }

      return { id: slug, labelAr: LABELS[slug], slug, children };
    });
  },
  ["storefront-menu-sections"],
  { revalidate: 300 }
);

/** GET /api/menu — returns menu sections with الكل, الاكثر مبيعا, and distinct tags from products in each category. */
export async function GET(_req: NextRequest) {
  const sections = await getMenuSections();
  return apiSuccess({ sections });
}
