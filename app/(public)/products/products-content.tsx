"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/shared/product-card";
import { ProductGridSkeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
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
};

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "newest", label: "الأحدث" },
  { value: "price_asc", label: "السعر: من الأقل" },
  { value: "price_desc", label: "السعر: من الأعلى" },
  { value: "name_ar", label: "الاسم أ–ي" },
];

export function ProductsContent() {
  const router = useRouter();
  const search = useSearchParams();
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const sortParam = search.get("sort") ?? "newest";

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (sortParam) params.set("sort", sortParam);
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
      <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold text-foreground md:text-3xl">
          كل المنتجات
        </h1>
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
          <p className="mb-4 text-sm text-muted-foreground">{total} منتج</p>
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
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
