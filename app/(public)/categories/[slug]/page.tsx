import { Suspense } from "react";
import { unstable_cache } from "next/cache";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { CategoryContent } from "./category-content";
import { LoadingDots } from "@/components/shared/loading-dots";
import { pageMetadata } from "@/lib/seo";

/** Category name/slug rarely changes and doesn't depend on the visitor, so this page
 *  is ISR-cached instead of force-dynamic — cuts a full function invocation + DB
 *  round trip per pageview down to one every 5 minutes per category. */
export const revalidate = 300;

const getCategory = unstable_cache(
  async (slug: string) => {
    return prisma.category.findFirst({
      where: { slug },
      select: { id: true, name: true, slug: true },
    });
  },
  ["category-by-slug"],
  { revalidate: 300 }
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) return { title: "تصنيف | نايل كينجز" };
  return pageMetadata({
    title: category.name,
    description: `تصفح منتجات ${category.name} من نايل كينجز`,
    path: `categories/${slug}`,
  });
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();

  return (
    <div className="container px-4 py-6 md:py-8">
      <Suspense fallback={<LoadingDots />}>
        <CategoryContent categorySlug={category.slug} categoryName={category.name} />
      </Suspense>
    </div>
  );
}
