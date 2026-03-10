"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/shared/product-card";
import { ProductGridSkeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { SortDropdown, type SortOptionValue } from "@/components/shared/sort-dropdown";
import { Package } from "lucide-react";

type ProductItem = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  priceEgp: number;
  originalPriceEgp?: number;
  discountPercent?: number;
  inStock: boolean;
  colorVariants?: { id: string; colorHex: string | null; colorName: string | null; imageUrl: string | null }[];
  /** When set, link to this variant (variant slug) for one-card-per-variant section view. */
  variantSlug?: string | null;
};

const DEFAULT_SORT: SortOptionValue = "name_ar";

export function CategoryContent({
  categorySlug,
  categoryName,
  searchParams,
}: {
  categorySlug: string;
  categoryName: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const sortFromUrlRaw = search.get("sort");
  const sortFromUrl = sortFromUrlRaw as SortOptionValue | null;
  const sortParam = sortFromUrl ?? DEFAULT_SORT;
  const sectionParam = search.get("section") ?? "";

  // Sync URL to default sort when missing so dropdown shows "ابجديا، من الالف للياء"
  useEffect(() => {
    if (sortFromUrlRaw != null && sortFromUrlRaw !== "") return;
    const next = new URLSearchParams(search.toString());
    next.set("sort", DEFAULT_SORT);
    router.replace(`/categories/${categorySlug}?${next.toString()}`, { scroll: false });
  }, [router, search, categorySlug, sortFromUrlRaw]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("category", categorySlug);
    if (sectionParam) params.set("section", sectionParam);
    if (sortParam) params.set("sort", sortParam);
    params.set("limit", "24");

    const res = await fetch(`/api/products?${params}`);
    const json = await res.json();
    if (json.success && json.data) {
      setProducts(json.data.products);
      setTotal(json.data.total);
    } else {
      setProducts([]);
      setTotal(0);
    }
    setLoading(false);
  }, [categorySlug, sectionParam, sortParam]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const updateSearch = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(search.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    });
    router.push(`/categories/${categorySlug}?${next.toString()}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">
            {categoryName}
          </h1>
          {sectionParam ? (
            <p className="mt-1 text-muted-foreground">{sectionParam}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SortDropdown
            value={sortParam}
            onChange={(value) => updateSearch({ sort: value })}
          />
        </div>
      </div>

      <div>
          {loading ? (
            <ProductGridSkeleton count={8} />
          ) : products.length === 0 ? (
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="لا توجد منتجات"
              description="جرّب تغيير الترتيب."
              action={
                <Button variant="outline" asChild>
                  <Link href="/">العودة للرئيسية</Link>
                </Button>
              }
            />
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                {total.toLocaleString("en-US")} منتج
              </p>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-3">
                {products.map((p) => (
                  <ProductCard
                    key={p.id}
                    id={p.id}
                    name={p.name}
                    slug={p.slug}
                    imageUrl={p.imageUrl}
                    price={p.priceEgp}
                    originalPrice={p.originalPriceEgp}
                    discountPercent={p.discountPercent}
                    colorVariants={p.colorVariants}
                    variantSlug={p.variantSlug}
                  />
                ))}
              </div>
            </>
          )}
      </div>
    </div>
  );
}
