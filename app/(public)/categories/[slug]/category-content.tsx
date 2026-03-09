"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/shared/product-card";
import { ProductGridSkeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronRight, Filter, Package } from "lucide-react";
import { cn } from "@/lib/utils";

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

type FilterOptions = {
  sizes: string[];
  minPrice: number;
  maxPrice: number;
  hasInStock: boolean;
};

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "newest", label: "الأحدث" },
  { value: "price_asc", label: "السعر: من الأقل" },
  { value: "price_desc", label: "السعر: من الأعلى" },
  { value: "name_ar", label: "الاسم أ–ي" },
];

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
  const [filters, setFilters] = useState<FilterOptions | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const minPriceParam = search.get("minPrice") ?? "";
  const maxPriceParam = search.get("maxPrice") ?? "";
  const sizesParam = search.get("sizes") ?? "";
  const inStockParam = search.get("inStock") === "true";
  const sortParam = search.get("sort") ?? "newest";
  const sectionParam = search.get("section") ?? "";

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("category", categorySlug);
    if (sectionParam) params.set("section", sectionParam);
    if (minPriceParam) params.set("minPrice", minPriceParam);
    if (maxPriceParam) params.set("maxPrice", maxPriceParam);
    if (sizesParam) params.set("sizes", sizesParam);
    if (inStockParam) params.set("inStock", "true");
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
  }, [categorySlug, sectionParam, minPriceParam, maxPriceParam, sizesParam, inStockParam, sortParam]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    fetch(`/api/categories/${categorySlug}/filters`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success && json.data) setFilters(json.data);
      });
  }, [categorySlug]);

  const updateSearch = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(search.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    });
    router.push(`/categories/${categorySlug}?${next.toString()}`);
  };

  const toggleSize = (size: string) => {
    const current = sizesParam ? sizesParam.split(",") : [];
    const next = current.includes(size)
      ? current.filter((s) => s !== size)
      : [...current, size];
    updateSearch({ sizes: next.length ? next.join(",") : undefined });
  };

  return (
    <>
      <nav className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          الرئيسية
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">{categoryName}</span>
      </nav>

      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">
          {categoryName}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="md:hidden"
            onClick={() => setFilterOpen((o) => !o)}
          >
            <Filter className="h-4 w-4 ml-1" />
            فلترة
          </Button>
          <select
            value={sortParam}
            onChange={(e) => updateSearch({ sort: e.target.value })}
            className="rounded-2xl border border-input bg-background px-3 py-2 text-sm"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex gap-5">
        <aside
          className={cn(
            "w-full shrink-0 md:w-56",
            !filterOpen && "hidden md:block"
          )}
        >
          {filters && (
            <div className="rounded-2xl border border-border bg-card p-4 shadow-subtle">
              <h3 className="mb-3 font-semibold text-foreground">السعر</h3>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder={String(filters.minPrice)}
                  value={minPriceParam}
                  onChange={(e) => updateSearch({ minPrice: e.target.value || undefined })}
                  className="rounded-xl"
                />
                <span className="text-muted-foreground">–</span>
                <Input
                  type="number"
                  placeholder={String(filters.maxPrice)}
                  value={maxPriceParam}
                  onChange={(e) => updateSearch({ maxPrice: e.target.value || undefined })}
                  className="rounded-xl"
                />
              </div>

              <h3 className="mt-4 mb-2 font-semibold text-foreground">المقاس</h3>
              <div className="flex flex-wrap gap-2">
                {filters.sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSize(s)}
                    className={cn(
                      "rounded-2xl border px-3 py-1.5 text-sm transition-colors",
                      sizesParam.split(",").includes(s)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background hover:bg-accent"
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>

              <label className="mt-4 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={inStockParam}
                  onChange={(e) =>
                    updateSearch({ inStock: e.target.checked ? "true" : undefined })
                  }
                  className="rounded border-input"
                />
                <span className="text-sm text-foreground">متوفر فقط</span>
              </label>
            </div>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          {loading ? (
            <ProductGridSkeleton count={8} />
          ) : products.length === 0 ? (
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title="لا توجد منتجات"
              description="جرّب تغيير الفلاتر أو الترتيب."
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
    </>
  );
}
