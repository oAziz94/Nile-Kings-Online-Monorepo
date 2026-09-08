"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/shared/product-card";
import { CatalogFilterBar, type CatalogFilterCategory } from "@/components/shared/catalog-filter-bar";
import { LoadingDots } from "@/components/shared/loading-dots";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Package } from "lucide-react";
import { useNavigateBackRestore } from "@/hooks/use-navigate-back-restore";

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

export function ProductsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [categories, setCategories] = useState<CatalogFilterCategory[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [category, setCategory] = useState(() => searchParams.get("category") ?? "");
  const [size, setSize] = useState(() => searchParams.get("size") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { restore, remember, clear } = useNavigateBackRestore("storefront-products-scroll");
  const initialLimitAppliedRef = useRef(false);
  const scrolledRef = useRef(false);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (category) params.set("category", category);
    if (size) params.set("size", size);
    const next = params.toString() ? `${pathname}?${params}` : pathname;
    router.replace(next, { scroll: false });
  }, [category, debouncedSearch, pathname, router, size]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    fetch(`/api/products/filters?${params}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!json.success || !json.data) return;
        const nextSizes = json.data.sizes ?? [];
        setCategories(json.data.categories ?? []);
        setSizes(nextSizes);
        if (size && !nextSizes.includes(size)) setSize("");
      })
      .catch(() => {
        setCategories([]);
        setSizes([]);
      });
  }, [category, size]);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const params = new URLSearchParams();
      params.set("expandVariants", "true");
      if (debouncedSearch) params.set("q", debouncedSearch);
      if (category) params.set("category", category);
      if (size) params.set("sizes", size);
      const limit =
        !append && !initialLimitAppliedRef.current && restore
          ? Math.max(PAGE_SIZE, restore.count)
          : PAGE_SIZE;
      if (!append) initialLimitAppliedRef.current = true;
      params.set("limit", String(limit));
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
    [category, debouncedSearch, size, restore]
  );

  useEffect(() => {
    setLoading(true);
    fetchPage(0, false).finally(() => setLoading(false));
  }, [fetchPage]);

  useEffect(() => {
    if (!restore || scrolledRef.current || products.length === 0) return;
    const el = document.querySelector(`[data-row-id="${CSS.escape(restore.id)}"]`);
    if (el) el.scrollIntoView({ block: "center" });
    if (el || products.length >= total) {
      scrolledRef.current = true;
      clear();
    }
  }, [products, total, restore, clear]);

  const clearFilters = () => {
    setSearch("");
    setCategory("");
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
          كل المنتجات
        </h1>
      </div>

      <div>
        <CatalogFilterBar
          search={search}
          category={category}
          size={size}
          categories={categories}
          sizes={sizes}
          total={total}
          loading={loading}
          onSearchChange={setSearch}
          onCategoryChange={setCategory}
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
            description="جرّب تغيير البحث أو الفلاتر المختارة."
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
                <div key={p.variantSlug ?? p.id} data-row-id={p.id} onClick={() => remember(p.id, products.length)}>
                  <ProductCard
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
                </div>
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
