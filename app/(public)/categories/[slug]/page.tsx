import { cache } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { CategoryContent } from "./category-content";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

/** Cached per-request so generateMetadata and the page share one DB round trip. */
const getCategory = cache(async (slug: string) => {
  return prisma.category.findFirst({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
});

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
      <CategoryContent categorySlug={category.slug} categoryName={category.name} />
    </div>
  );
}
