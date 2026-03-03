import Link from "next/link";
import { prisma } from "@/lib/db";
import { Package } from "lucide-react";
import { pageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = pageMetadata({
  title: "التصنيفات",
  description: "تصفح تصنيفات المنتجات في متجر نايل كينجز",
  path: "categories",
});

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: { where: { active: true } } } } },
  });

  return (
    <div className="container px-4 py-6 md:py-8">
      <h1 className="mb-5 flex items-center gap-2 text-2xl font-bold text-foreground md:text-3xl">
        <Package className="h-8 w-8" />
        التصنيفات
      </h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/categories/${c.slug}`}
            className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-6 text-center shadow-subtle transition-colors hover:border-primary/50 hover:shadow-card"
          >
            <span className="font-semibold text-foreground">{c.name}</span>
            <span className="mt-2 text-sm text-muted-foreground">
              {c._count.products} منتج
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
