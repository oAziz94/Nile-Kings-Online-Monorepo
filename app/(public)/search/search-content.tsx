"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { productCardLabel, type ProductListItem } from "@/lib/catalog";
import { ProductCard } from "@/components/shared/product-card";
import { ProductGridSkeleton } from "@/components/shared/skeleton";
import { Button } from "@/components/ui/button";

/**
 * `/search` results — backlog 6.1. Same `ProductCard`/grid the category listing uses
 * (`components/shared/catalog-listing.tsx`), fed by `GET /api/products?q=`. Deliberately not the
 * full `CatalogListing` (its category/size/price filter bar is out of scope here — the inventory
 * names no dedicated search experience to preserve, this is genuinely new surface).
 */
export function SearchContent() {
  const searchParams = useSearchParams();
  const q = (searchParams.get("q") ?? "").trim();

  const [products, setProducts] = useState<ProductListItem[]>([]);
  const [loading, setLoading] = useState(Boolean(q));
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!q) {
      setProducts([]);
      setLoading(false);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/products?q=${encodeURIComponent(q)}&limit=48`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && json.data) {
          setProducts(json.data.products ?? []);
        } else {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8 lg:px-8">
      <h1 className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)] md:text-3xl">
        نتائج البحث عن «{q}»
      </h1>

      <div className="mt-6">
        {!q ? (
          <div className="flex flex-col items-center gap-3 border border-[hsl(228_16%_82%)] bg-[hsl(38_22%_95%)] p-10 text-center">
            <p className="text-sm text-[hsl(228_18%_45%)]">اكتب اسم منتج في مربع البحث أعلى الصفحة.</p>
            <Link href="/categories" className="border-b border-gold-500 pb-0.5 text-sm text-[hsl(228_40%_14%)]">
              تصفح التصنيفات
            </Link>
          </div>
        ) : error ? (
          <div role="alert" className="flex flex-col items-center gap-3 border border-[hsl(0_70%_45%)]/30 bg-[hsl(0_70%_97%)] p-10 text-center">
            <AlertTriangle className="h-8 w-8 text-[hsl(0_70%_45%)]" aria-hidden />
            <p className="font-amiri text-lg font-bold text-[hsl(228_40%_14%)]">حدث خطأ أثناء البحث</p>
            <Button type="button" onClick={() => window.location.reload()}>
              حاول مرة أخرى
            </Button>
          </div>
        ) : loading ? (
          <ProductGridSkeleton count={9} />
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center gap-4 border border-[hsl(228_16%_82%)] bg-[hsl(38_22%_95%)] p-10 text-center">
            <p className="text-sm text-[hsl(228_18%_45%)]">لا توجد نتائج لـ «{q}»</p>
            <Link href="/categories" className="border-b border-gold-500 pb-0.5 text-sm text-[hsl(228_40%_14%)]">
              تصفح التصنيفات
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
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
                categoryLabel={productCardLabel(p)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
