"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Package, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/skeleton";

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  productCount: number;
};

/** Real static tile art for the three seeded top-level categories — the home pattern
 * (`04-decisions.md` 2026-09-12, decision 9). Any other category falls back to a tonal block. */
const CATEGORY_IMAGE: Record<string, string> = {
  men: "/brand/storefront/category-men.jpg",
  women: "/brand/storefront/category-women.jpg",
  kids: "/brand/storefront/category-kids.jpg",
};

function CategoryTileSkeleton() {
  return (
    <div className="overflow-hidden border border-[hsl(228_16%_88%)] bg-papyrus">
      <Skeleton className="aspect-[4/3] w-full" />
      <div className="space-y-2 p-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

/**
 * Categories index (`/categories`) — backlog 4.8: the three (or more) category tiles in the
 * home pattern, real product counts, single fetch (there are far fewer than 24 categories today,
 * so the original 300s-cached endpoint is called once — infinite scroll would be dead code, not
 * a feature, at the current catalog size; the endpoint/cache themselves are untouched).
 */
export function CategoriesContent() {
  const [categories, setCategories] = useState<CategoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch("/api/categories?limit=48&offset=0", { cache: "no-store" });
      const json = await res.json();
      if (json.success && json.data) {
        setCategories(json.data.categories ?? []);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="container px-4 py-6 md:py-8">
      <h1 className="mb-5 flex items-center gap-2 text-2xl font-bold text-foreground md:text-3xl">
        <Package className="h-7 w-7" aria-hidden />
        التصنيفات
      </h1>

      {error ? (
        <div role="alert" className="flex flex-col items-center gap-3 border border-[hsl(0_70%_45%)]/30 bg-[hsl(0_70%_97%)] p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-[hsl(0_70%_45%)]" aria-hidden />
          <p className="font-amiri text-lg font-bold text-[hsl(228_40%_14%)]">
            حدث خطأ أثناء تحميل التصنيفات
          </p>
          <Button type="button" onClick={load}>
            حاول مرة أخرى
          </Button>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <CategoryTileSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {(categories ?? []).map((c) => {
            const image = CATEGORY_IMAGE[c.slug];
            return (
              <Link
                key={c.id}
                href={`/categories/${c.slug}`}
                className="group block overflow-hidden border border-[hsl(228_16%_88%)] bg-papyrus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-[hsl(38_22%_90%)]">
                  {image ? (
                    <Image
                      src={image}
                      alt={c.name}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 768px) 50vw, 25vw"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,hsl(228_30%_88%)_0%,hsl(38_30%_88%)_100%)]">
                      <Package className="h-8 w-8 text-[hsl(228_18%_45%)]" aria-hidden />
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <span className="block font-amiri text-lg font-bold text-[hsl(228_40%_14%)]">
                    {c.name}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    <span className="font-archivo" style={{ direction: "ltr" }}>
                      {c.productCount.toLocaleString("en-US")}
                    </span>{" "}
                    منتج
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
