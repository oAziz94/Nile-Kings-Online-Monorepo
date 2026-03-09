"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ProductCard } from "@/components/shared/product-card";
import { ProductGridSkeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Search as SearchIcon, Tag } from "lucide-react";

type ProductItem = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  priceEgp: number;
  originalPriceEgp?: number;
  discountPercent?: number;
  colorVariants?: { id: string; colorHex: string | null; colorName: string | null; imageUrl: string | null }[];
};

export function SearchContent({
  initialParams,
}: {
  initialParams: Record<string, string | string[] | undefined>;
}) {
  const search = useSearchParams();
  const q =
    typeof search.get("q") === "string"
      ? search.get("q")!
      : typeof initialParams.q === "string"
        ? initialParams.q
        : "";
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setProducts([]);
      setTotal(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetch(
      `/api/products/search?q=${encodeURIComponent(query.trim())}&limit=24`
    );
    const json = await res.json();
    if (json.success && json.data) {
      setProducts(json.data.products);
      setTotal(json.data.total);
    } else {
      setProducts([]);
      setTotal(0);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSearch(q);
  }, [q, fetchSearch]);

  return (
    <>
      <header className="mb-5">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground md:text-3xl">
          <SearchIcon className="h-7 w-7" />
          البحث
        </h1>
        <p className="mt-2 text-muted-foreground">
          ابحث بالاسم بالعربية أو بالوسم (مثال: تيشيرت، قطني، رجالي).
        </p>
      </header>

      {q && (
        <p className="mb-4 text-sm text-muted-foreground">
          النتائج لـ &quot;{q}&quot;: {total.toLocaleString("en-US")} منتج
        </p>
      )}

      {loading ? (
        <ProductGridSkeleton count={8} />
      ) : !q ? (
        <EmptyState
          icon={<SearchIcon className="h-8 w-8" />}
          title="أدخل كلمة البحث"
          description="استخدم شريط البحث في الأعلى أو اكتب في الرابط: /search?q=كلمة"
        />
      ) : products.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-8 w-8" />}
          title="لا توجد نتائج"
          description="جرّب كلمات أخرى أو وسوم مثل: تيشيرت، قطني، نسائي."
          action={
            <Link
              href="/"
              className="text-sm font-medium text-primary hover:underline"
            >
              العودة للرئيسية
            </Link>
          }
        />
      ) : (
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
      )}
    </>
  );
}
