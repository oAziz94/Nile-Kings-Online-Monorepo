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
};

const DEFAULT_SORT: SortOptionValue = "featured";

export function ProductsContent() {
  const router = useRouter();
  const search = useSearchParams();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const sortParam = (search.get("sort") as SortOptionValue) ?? DEFAULT_SORT;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("sort", sortParam);
    params.set("limit", "48");

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
  }, [sortParam]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const updateSearch = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(search.toString());
    Object.entries(updates).forEach(([k, v]) => {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    });
    router.push(`/products?${next.toString()}`);
  };

  return (
    <>
      {/* Top bar: sort centered, matching reference layout */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">
          كل المنتجات
        </h1>
        <div className="flex w-full flex-shrink-0 justify-center md:w-auto md:justify-end">
          <SortDropdown
            value={sortParam}
            onChange={(value) => updateSearch({ sort: value })}
          />
        </div>
      </div>

      {loading ? (
        <ProductGridSkeleton count={8} />
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
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
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
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
