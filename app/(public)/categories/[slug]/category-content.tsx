"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/shared/product-card";
import { CatalogFilterBar } from "@/components/shared/catalog-filter-bar";
import { LoadingDots } from "@/components/shared/loading-dots";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
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
  /** When set, link to this variant (variant slug) for one-card-per-variant section view. */
  variantSlug?: string | null;
};

export function CategoryContent({
  categorySlug,
  categoryName,
}: {
  categorySlug: string;
  categoryName: string;
}) {
  const search = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [query, setQuery] = useState(() => search.get("q") ?? "");
  const [size, setSize] = useState(() => search.get("size") ?? "");
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const sectionParam = search.get("section") ?? "";

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (sectionParam) params.set("section", sectionParam);
    if (debouncedQuery) params.set("q", debouncedQuery);
    if (size) params.set("size", size);
    const next = params.toString() ? `${pathname}?${params}` : pathname;
    router.replace(next, { scroll: false });
  }, [debouncedQuery, pathname, router, sectionParam, size]);

  useEffect(() => {
    const params = new URLSearchParams({ category: categorySlug });
    fetch(`/api/products/filters?${params}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!json.success || !json.data) return;
        const nextSizes = json.data.sizes ?? [];
        setSizes(nextSizes);
        if (size && !nextSizes.includes(size)) setSize("");
      })
      .catch(() => setSizes([]));
  }, [categorySlug, size]);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const params = new URLSearchParams();
      params.set("category", categorySlug);
      if (sectionParam) params.set("section", sectionParam);
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (size) params.set("sizes", size);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      const res = await fetch(`/api/products?${params}`, { cache: "no-store" });
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
    [categorySlug, debouncedQuery, sectionParam, size]
  );

  useEffect(() => {
    setLoading(true);
    fetchPage(0, false).finally(() => setLoading(false));
  }, [fetchPage]);

  const clearFilters = () => {
    setQuery("");
    setSize("");
  };

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

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">
          {categoryName}
        </h1>
        {sectionParam ? (
          <p className="mt-1 text-muted-foreground">{sectionParam}</p>
        ) : null}
      </div>

      <div>
        <CatalogFilterBar
          search={query}
          size={size}
          sizes={sizes}
          total={total}
          loading={loading}
          showCategory={false}
          onSearchChange={setQuery}
          onSizeChange={setSize}
          onClear={clearFilters}
        />

        {loading ? (
          <div className="flex min-h-[200px] items-center justify-center py-12">
            <LoadingDots className="scale-150" />
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package className="h-8 w-8" />}
            title="لا توجد منتجات"
            description="جرّب تغيير البحث أو المقاس المختار."
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
