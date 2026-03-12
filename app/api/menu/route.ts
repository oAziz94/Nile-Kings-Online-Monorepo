import { NextRequest } from "next/server";
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

/** GET /api/menu — returns menu sections with الكل, الاكثر مبيعا, and distinct tags from products in each category. */
export async function GET(_req: NextRequest) {
  const sections: MenuSection[] = [];

  for (const slug of CATEGORY_SLUGS) {
    const baseHref = `/categories/${slug}`;
    const children: MenuSection["children"] = [
      { labelAr: "الكل", href: baseHref },
      { labelAr: "الاكثر مبيعا", href: `${baseHref}?sort=best_sales` },
    ];

    const category = await prisma.category.findFirst({
      where: { slug },
      select: { id: true },
    });

    if (category) {
      const products = await prisma.product.findMany({
        where: { categoryId: category.id, active: true },
        select: { tags: true },
      });
      const allTags = products.flatMap((p) => p.tags).filter(Boolean);
      const uniqueTags = [...new Set(allTags)].sort((a, b) => a.localeCompare(b, "ar"));
      for (const tag of uniqueTags) {
        children.push({
          labelAr: tag,
          sectionSlug: tag,
          href: `${baseHref}?section=${encodeURIComponent(tag)}`,
        });
      }
    }

    sections.push({
      id: slug,
      labelAr: LABELS[slug],
      slug,
      children,
    });
  }

  return apiSuccess({ sections });
}
