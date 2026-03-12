"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/shared/product-card";
import { ProductGridSkeleton } from "@/components/shared/skeleton";
import { LoadingDots } from "@/components/shared/loading-dots";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { SortDropdown, type SortOptionValue } from "@/components/shared/sort-dropdown";
import { Package } from "lucide-react";

const PAGE_SIZE = 9;

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
  /** When set, link to this variant (variant slug) for one-card-per-variant view. */
  variantSlug?: string | null;
};

const DEFAULT_SORT: SortOptionValue = "name_ar";

export function ProductsContent() {
  const router = useRouter();
  const search = useSearchParams();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const sortFromUrlRaw = search.get("sort");
  const sortFromUrl = sortFromUrlRaw as SortOptionValue | null;
  const sortParam = sortFromUrl ?? DEFAULT_SORT;

  // Sync URL to default sort when missing so dropdown shows "ابجديا، من الالف للياء" not fallback
  useEffect(() => {
    if (sortFromUrlRaw != null && sortFromUrlRaw !== "") return;
    const next = new URLSearchParams(search.toString());
    next.set("sort", DEFAULT_SORT);
    router.replace(`/products?${next.toString()}`, { scroll: false });
  }, [router, search, sortFromUrlRaw]);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const params = new URLSearchParams();
      params.set("expandVariants", "true");
      params.set("sort", sortParam);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      const res = await fetch(`/api/products?${params}`);
      const json = await res.json();
      if (json.success && json.data) {
        if (append) {
          setProducts((prev) => [...prev, ...(json.data.products ?? [])]);
        } else {
          setProducts(json.data.products ?? []);
        }
        setTotal(json.data.total ?? 0);
      } else if (!append) {
        setProducts([]);
        setTotal(0);
      }
    },
    [sortParam]
  );

  useEffect(() => {
    setLoading(true);
    fetchPage(0, false).finally(() => setLoading(false));
  }, [fetchPage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (
          !entry?.isIntersecting ||
          loading ||
          loadingMore ||
          products.length >= total ||
          total === 0
        )
          return;
        setLoadingMore(true);
        fetchPage(products.length, true).finally(() => setLoadingMore(false));
      },
      { rootMargin: "200px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, loadingMore, products.length, total, fetchPage]);

  const updateSearch = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(search.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    });
    router.push(`/products?${next.toString()}`);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">
            كل المنتجات
          </h1>
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
          <div className="flex min-h-[200px] items-center justify-center py-12">
            <LoadingDots className="scale-150" />
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title="لا توجد منتجات"
            description="لم يتم إضافة منتجات بعد."
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
                  key={p.variantSlug ?? p.id}
                  id={p.id}
                  name={p.name}
                  slug={p.slug}
                  imageUrl={p.imageUrl}
                  price={p.priceEgp}
                  originalPrice={p.originalPriceEgp}
                  discountPercent={p.discountPercent}
                  colorVariants={p.colorVariants}
                  variantSlug={p.variantSlug}
                  inStock={p.inStock}
                />
              ))}
            </div>
            <div ref={sentinelRef} className="h-4" aria-hidden />
            {loadingMore && (
              <div className="mt-6 flex justify-center py-4">
                <LoadingDots className="scale-150" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
