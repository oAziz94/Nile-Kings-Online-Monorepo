import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { CategoryContent } from "./category-content";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await prisma.category.findFirst({
    where: { slug },
    select: { name: true },
  });
  if (!category) return { title: "تصنيف | نايل كينجز" };
  return pageMetadata({
    title: category.name,
    description: `تصفح منتجات ${category.name} من نايل كينجز`,
    path: `categories/${slug}`,
  });
}

async function getCategory(slug: string) {
  return prisma.category.findFirst({
    where: { slug },
    select: { id: true, name: true, slug: true },
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const category = await getCategory(slug);
  if (!category) notFound();

  const q = await searchParams;
  return (
    <div className="container px-4 py-6 md:py-8">
      <CategoryContent
        categorySlug={category.slug}
        categoryName={category.name}
        searchParams={q}
      />
    </div>
  );
}
