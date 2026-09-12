"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { ProductCard } from "@/components/shared/product-card";
import { CatalogFilterBar, type CatalogFilterCategory } from "@/components/shared/catalog-filter-bar";
import { CatalogMobileFilters, type CatalogDraftFilters } from "@/components/shared/catalog-mobile-filters";
import type { SortOptionValue } from "@/components/shared/sort-dropdown";
import { ProductGridSkeleton, ProductCardSkeleton } from "@/components/shared/skeleton";
import { Button } from "@/components/ui/button";
import { useNavigateBackRestore } from "@/hooks/use-navigate-back-restore";
import { MENU_SECTIONS } from "@/lib/menu-config";
import type { PriceRangeValue } from "@/components/shared/price-range-control";

const PAGE_SIZE = 9;
const DEFAULT_SORT: SortOptionValue = "featured";

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
  variantSlug?: string | null;
};

interface CatalogListingProps {
  /** When set, the category is fixed by the route (`/categories/[slug]`) and its selector is hidden. */
  lockedCategory?: { slug: string; name: string };
}

function buildParams(input: {
  q: string;
  category: string;
  section: string;
  size: string;
  minPrice?: number;
  maxPrice?: number;
  inStock: boolean;
  sort: SortOptionValue;
  boundsReady: boolean;
  bounds: PriceRangeValue;
}) {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.category) params.set("category", input.category);
  if (input.section) params.set("section", input.section);
  if (input.size) params.set("sizes", input.size);
  // Only send a price bound once the real bounds are known and the shopper narrowed the range —
  // sending the untouched full range is a no-op filter but adds a URL param for nothing.
  if (
    input.boundsReady &&
    input.minPrice != null &&
    input.minPrice > input.bounds.min
  ) {
    params.set("minPrice", String(input.minPrice));
  }
  if (
    input.boundsReady &&
    input.maxPrice != null &&
    input.maxPrice < input.bounds.max
  ) {
    params.set("maxPrice", String(input.maxPrice));
  }
  if (input.inStock) params.set("inStock", "true");
  if (input.sort !== DEFAULT_SORT) params.set("sort", input.sort);
  return params;
}

export function CatalogListing({ lockedCategory }: CatalogListingProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const scrollKey = lockedCategory
    ? `storefront-category-${lockedCategory.slug}-scroll`
    : "storefront-products-scroll";
  const { restore, remember, clear } = useNavigateBackRestore(scrollKey);

  const sectionParam = lockedCategory ? searchParams.get("section") ?? "" : "";

  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [category, setCategory] = useState(
    () => lockedCategory?.slug ?? searchParams.get("category") ?? ""
  );
  const [size, setSize] = useState(() => searchParams.get("size") ?? "");
  const [sort, setSort] = useState<SortOptionValue>(
    () => (searchParams.get("sort") as SortOptionValue | null) ?? DEFAULT_SORT
  );
  const [minPrice, setMinPrice] = useState<number | undefined>(() => {
    const v = searchParams.get("minPrice");
    return v ? Number(v) : undefined;
  });
  const [maxPrice, setMaxPrice] = useState<number | undefined>(() => {
    const v = searchParams.get("maxPrice");
    return v ? Number(v) : undefined;
  });
  const [debouncedMinPrice, setDebouncedMinPrice] = useState(minPrice);
  const [debouncedMaxPrice, setDebouncedMaxPrice] = useState(maxPrice);
  const [inStock, setInStock] = useState(() => searchParams.get("inStock") === "true");

  const [categories, setCategories] = useState<CatalogFilterCategory[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [bounds, setBounds] = useState<PriceRangeValue>({ min: 0, max: 0 });
  const [boundsReady, setBoundsReady] = useState(false);

  const [products, setProducts] = useState<ProductItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const [previewTotal, setPreviewTotal] = useState<number | null>(null);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const initialLimitAppliedRef = useRef(false);
  const scrolledRef = useRef(false);

  const isLocked = Boolean(lockedCategory);

  // --- Search debounce (250ms) ---
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(handle);
  }, [search]);

  // --- Price debounce (avoids one fetch per pixel while dragging the slider) ---
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedMinPrice(minPrice), 250);
    return () => window.clearTimeout(handle);
  }, [minPrice]);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedMaxPrice(maxPrice), 250);
    return () => window.clearTimeout(handle);
  }, [maxPrice]);

  const displayRange: PriceRangeValue = {
    min: minPrice ?? bounds.min,
    max: maxPrice ?? bounds.max,
  };

  // --- URL sync ---
  useEffect(() => {
    const params = buildParams({
      q: debouncedSearch,
      category: isLocked ? "" : category,
      section: sectionParam,
      size,
      minPrice: debouncedMinPrice,
      maxPrice: debouncedMaxPrice,
      inStock,
      sort,
      boundsReady,
      bounds,
    });
    const next = params.toString() ? `${pathname}?${params}` : pathname;
    router.replace(next, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    category,
    debouncedSearch,
    debouncedMinPrice,
    debouncedMaxPrice,
    inStock,
    isLocked,
    pathname,
    router,
    sectionParam,
    size,
    sort,
  ]);

  // --- Category/size facet refresh (`/api/products/filters`), silent size-clear rule ---
  useEffect(() => {
    const params = new URLSearchParams();
    const scopedCategory = isLocked ? lockedCategory!.slug : category;
    if (scopedCategory) params.set("category", scopedCategory);
    fetch(`/api/products/filters?${params}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!json.success || !json.data) return;
        const nextSizes: string[] = json.data.sizes ?? [];
        if (!isLocked) setCategories(json.data.categories ?? []);
        setSizes(nextSizes);
        setSize((current) => (current && !nextSizes.includes(current) ? "" : current));
      })
      .catch(() => {
        if (!isLocked) setCategories([]);
        setSizes([]);
      });
  }, [category, isLocked, lockedCategory]);

  // --- Price bounds: category-scoped filters endpoint when locked, min/max probe otherwise ---
  useEffect(() => {
    let cancelled = false;
    setBoundsReady(false);
    async function load() {
      try {
        if (lockedCategory) {
          const res = await fetch(`/api/categories/${lockedCategory.slug}/filters`, { cache: "no-store" });
          const json = await res.json();
          if (cancelled) return;
          if (json.success && json.data) {
            setBounds({ min: json.data.minPrice ?? 0, max: json.data.maxPrice ?? json.data.minPrice ?? 0 });
          }
          return;
        }
        const scopeParams = new URLSearchParams();
        if (category) scopeParams.set("category", category);
        const [lowRes, highRes] = await Promise.all([
          fetch(`/api/products?${scopeParams}&sort=price_asc&limit=1`, { cache: "no-store" }),
          fetch(`/api/products?${scopeParams}&sort=price_desc&limit=1`, { cache: "no-store" }),
        ]);
        const [lowJson, highJson] = await Promise.all([lowRes.json(), highRes.json()]);
        if (cancelled) return;
        const lo = lowJson?.success ? (lowJson.data?.products?.[0]?.priceEgp ?? 0) : 0;
        const hi = highJson?.success ? (highJson.data?.products?.[0]?.priceEgp ?? lo) : lo;
        setBounds({ min: lo, max: Math.max(hi, lo) });
      } catch {
        if (!cancelled) setBounds({ min: 0, max: 0 });
      } finally {
        if (!cancelled) setBoundsReady(true);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [category, lockedCategory]);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const params = buildParams({
        q: debouncedSearch,
        category: isLocked ? lockedCategory!.slug : category,
        section: sectionParam,
        size,
        minPrice: debouncedMinPrice,
        maxPrice: debouncedMaxPrice,
        inStock,
        sort,
        boundsReady,
        bounds,
      });
      const limit =
        !append && !initialLimitAppliedRef.current && restore
          ? Math.max(PAGE_SIZE, restore.count)
          : PAGE_SIZE;
      if (!append) initialLimitAppliedRef.current = true;
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      try {
        const res = await fetch(`/api/products?${params}`, { cache: "no-store" });
        const json = await res.json();
        if (json.success && json.data) {
          if (append) {
            setProducts((prev) => [...prev, ...(json.data.products ?? [])]);
          } else {
            setProducts(json.data.products ?? []);
          }
          setTotal(json.data.total ?? 0);
          setError(false);
        } else if (!append) {
          setProducts([]);
          setTotal(0);
          setError(true);
        }
      } catch {
        if (!append) {
          setProducts([]);
          setTotal(0);
        }
        setError(true);
      }
    },
    [
      bounds,
      boundsReady,
      category,
      debouncedMaxPrice,
      debouncedMinPrice,
      debouncedSearch,
      inStock,
      isLocked,
      lockedCategory,
      restore,
      sectionParam,
      size,
      sort,
    ]
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

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting || loading || loadingMore || error || products.length >= total || total === 0)
          return;
        setLoadingMore(true);
        fetchPage(products.length, true).finally(() => setLoadingMore(false));
      },
      { rootMargin: "200px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, loadingMore, error, products.length, total, fetchPage]);

  const clearFilters = useCallback(() => {
    setSearch("");
    if (!isLocked) setCategory("");
    setSize("");
    setMinPrice(undefined);
    setMaxPrice(undefined);
    setInStock(false);
  }, [isLocked]);

  const hasActiveFilters = Boolean(
    search.trim() ||
      (!isLocked && category) ||
      size ||
      (minPrice != null && minPrice > bounds.min) ||
      (maxPrice != null && maxPrice < bounds.max) ||
      inStock
  );

  const activeFilterCount = [
    !isLocked && category ? 1 : 0,
    size ? 1 : 0,
    minPrice != null && minPrice > bounds.min ? 1 : 0,
    maxPrice != null && maxPrice < bounds.max ? 1 : 0,
    inStock ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // --- Mobile filter sheet: a local draft that only commits to the real (fetched) state on
  // "عرض N منتجًا" — desktop applies every change live, mobile does not (backlog 4.8). ---
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileDraft, setMobileDraft] = useState<CatalogDraftFilters>({
    category,
    size,
    priceRange: displayRange,
    inStock,
    sort,
  });

  function openMobileFilters() {
    setMobileDraft({ category, size, priceRange: displayRange, inStock, sort });
    // Seed with `null` (renders "عرض المنتجات", no number) rather than the last-known `total` —
    // that number describes the *previous* filter set, not the freshly-reset draft, and showing
    // it (or a stale 0) as if it were a live count would be misleading, not just imprecise.
    setPreviewTotal(null);
    setMobileFilterOpen(true);
  }

  const previewParamsKey = useMemo(
    () =>
      JSON.stringify({
        category: isLocked ? lockedCategory?.slug ?? "" : mobileDraft.category,
        size: mobileDraft.size,
        min: mobileDraft.priceRange.min,
        max: mobileDraft.priceRange.max,
        inStock: mobileDraft.inStock,
        sort: mobileDraft.sort,
        q: debouncedSearch,
      }),
    [debouncedSearch, isLocked, lockedCategory, mobileDraft]
  );

  useEffect(() => {
    if (!mobileFilterOpen) return;
    let cancelled = false;
    const handle = window.setTimeout(() => {
      const parsed = JSON.parse(previewParamsKey) as {
        category: string;
        size: string;
        min: number;
        max: number;
        inStock: boolean;
        sort: SortOptionValue;
        q: string;
      };
      const params = buildParams({
        q: parsed.q,
        category: parsed.category,
        section: sectionParam,
        size: parsed.size,
        minPrice: parsed.min,
        maxPrice: parsed.max,
        inStock: parsed.inStock,
        sort: parsed.sort,
        boundsReady,
        bounds,
      });
      params.set("limit", "1");
      fetch(`/api/products?${params}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((json) => {
          if (cancelled) return;
          // A failed/malformed response leaves the count unknown ("عرض المنتجات") rather than
          // asserting 0 — 0 must only ever mean the server actually said zero matches.
          setPreviewTotal(json.success ? (json.data?.total ?? null) : null);
        })
        .catch(() => {
          if (!cancelled) setPreviewTotal(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [mobileFilterOpen, previewParamsKey, sectionParam, boundsReady, bounds]);

  function applyMobileDraft() {
    if (!isLocked) setCategory(mobileDraft.category);
    setSize(mobileDraft.size);
    setMinPrice(mobileDraft.priceRange.min > bounds.min ? mobileDraft.priceRange.min : undefined);
    setMaxPrice(mobileDraft.priceRange.max < bounds.max ? mobileDraft.priceRange.max : undefined);
    setInStock(mobileDraft.inStock);
    setSort(mobileDraft.sort);
    setMobileFilterOpen(false);
  }

  const CATEGORY_SHORT_LABEL: Record<string, string> = { men: "رجالي", women: "حريمي", kids: "أطفال" };
  const emptyCategoryLinks = MENU_SECTIONS.map((s) => ({
    label: CATEGORY_SHORT_LABEL[s.slug] ?? s.labelAr,
    href: s.children[0]?.href ?? `/categories/${s.slug}`,
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6 lg:px-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">
          {lockedCategory ? lockedCategory.name : "كل المنتجات"}
        </h1>
        {sectionParam ? <p className="mt-1 text-muted-foreground">{sectionParam}</p> : null}
      </div>

      <CatalogMobileFilters
        search={search}
        onSearchChange={setSearch}
        sort={sort}
        onSortChange={setSort}
        categories={categories}
        showCategory={!isLocked}
        sizes={sizes}
        priceBounds={bounds}
        priceBoundsReady={boundsReady}
        open={mobileFilterOpen}
        onOpenChange={(next) => (next ? openMobileFilters() : setMobileFilterOpen(false))}
        draft={mobileDraft}
        onDraftChange={setMobileDraft}
        activeFilterCount={activeFilterCount}
        previewTotal={previewTotal}
        onApply={applyMobileDraft}
        onClear={() => {
          clearFilters();
          setMobileFilterOpen(false);
        }}
        className="mb-4"
      />

      <CatalogFilterBar
        search={search}
        category={category}
        size={size}
        categories={categories}
        sizes={sizes}
        priceRange={displayRange}
        priceBounds={bounds}
        priceBoundsReady={boundsReady}
        inStock={inStock}
        sort={sort}
        showCategory={!isLocked}
        hasActiveFilters={hasActiveFilters}
        onSearchChange={setSearch}
        onCategoryChange={setCategory}
        onSizeChange={setSize}
        onPriceChange={(v) => {
          setMinPrice(v.min);
          setMaxPrice(v.max);
        }}
        onInStockChange={setInStock}
        onSortChange={setSort}
        onClear={clearFilters}
        className="mb-6"
      />

      <div aria-live="polite" className="mb-4">
        <p className="text-sm text-muted-foreground">
          {loading ? "جارٍ التحميل" : (
            <>
              <span className="font-archivo" style={{ direction: "ltr" }}>
                {total.toLocaleString("en-US")}
              </span>{" "}
              منتجًا
            </>
          )}
        </p>
      </div>

      {error ? (
        <div role="alert" className="flex flex-col items-center gap-3 border border-[hsl(0_70%_45%)]/30 bg-[hsl(0_70%_97%)] p-10 text-center">
          <AlertTriangle className="h-8 w-8 text-[hsl(0_70%_45%)]" aria-hidden />
          <p className="font-amiri text-lg font-bold text-[hsl(228_40%_14%)]">
            حدث خطأ أثناء تحميل المنتجات
          </p>
          <p className="max-w-sm text-sm text-[hsl(228_18%_45%)]">
            تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.
          </p>
          <Button type="button" onClick={() => fetchPage(0, false)}>
            حاول مرة أخرى
          </Button>
        </div>
      ) : loading ? (
        <ProductGridSkeleton count={PAGE_SIZE} />
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center gap-4 border border-[hsl(228_16%_82%)] bg-[hsl(38_22%_95%)] p-10 text-center">
          {debouncedSearch ? (
            <p className="text-sm text-[hsl(228_18%_45%)]">
              0 نتائج لـ «{debouncedSearch}»
            </p>
          ) : null}
          <h2 className="font-amiri text-xl font-bold text-[hsl(228_40%_14%)] md:text-2xl">
            لم نجد ما تبحث عنه — كل ما لدينا قطن مصري.
          </h2>
          <p className="max-w-md text-sm text-[hsl(228_18%_45%)]">
            جرّب تعديل البحث أو إزالة بعض الفلاتر، أو تصفح فئاتنا مباشرة.
          </p>
          <Button type="button" variant="outline" onClick={clearFilters}>
            مسح البحث والفلاتر
          </Button>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            {emptyCategoryLinks.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                className="border border-[hsl(228_16%_82%)] px-4 py-2 text-sm font-medium text-[hsl(228_40%_14%)] hover:border-[hsl(228_40%_14%)]"
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
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
            <div role="status" className="mt-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <ProductCardSkeleton key={i} />
                ))}
              </div>
              <p className="text-center text-sm text-muted-foreground">جارٍ تحميل المزيد…</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
