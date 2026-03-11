"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { LoadingDots } from "@/components/shared/loading-dots";

const PAGE_SIZE = 24;

type CategoryItem = {
  id: string;
  name: string;
  slug: string;
  sortOrder: number;
  productCount: number;
};

function CategoryCardSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-6 text-center">
      <div className="h-5 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-4 w-16 animate-pulse rounded bg-muted" />
    </div>
  );
}

export function CategoriesContent() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (offset: number, append: boolean) => {
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(offset));
    const res = await fetch(`/api/categories?${params}`);
    const json = await res.json();
    if (json.success && json.data) {
      const list = json.data.categories ?? [];
      const totalCount = json.data.total ?? 0;
      if (append) {
        setCategories((prev) => [...prev, ...list]);
      } else {
        setCategories(list);
      }
      setTotal(totalCount);
    } else if (!append) {
      setCategories([]);
      setTotal(0);
    }
  }, []);

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
          categories.length >= total ||
          total === 0
        )
          return;
        setLoadingMore(true);
        fetchPage(categories.length, true).finally(() => setLoadingMore(false));
      },
      { rootMargin: "200px", threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loading, loadingMore, categories.length, total, fetchPage]);

  if (loading) {
    return (
      <div className="container px-4 py-6 md:py-8">
        <h1 className="mb-5 flex items-center gap-2 text-2xl font-bold text-foreground md:text-3xl">
          <Package className="h-8 w-8" />
          التصنيفات
        </h1>
        <div className="flex min-h-[200px] items-center justify-center py-12">
          <LoadingDots className="scale-150" />
        </div>
      </div>
    );
  }

  return (
    <div className="container px-4 py-6 md:py-8">
      <h1 className="mb-5 flex items-center gap-2 text-2xl font-bold text-foreground md:text-3xl">
        <Package className="h-8 w-8" />
        التصنيفات
      </h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {categories.map((c) => (
          <Link
            key={c.id}
            href={`/categories/${c.slug}`}
            className="flex flex-col items-center justify-center rounded-2xl border border-border bg-card p-6 text-center shadow-subtle transition-colors hover:border-primary/50 hover:shadow-card"
          >
            <span className="font-semibold text-foreground">{c.name}</span>
            <span className="mt-2 text-sm text-muted-foreground">
              {c.productCount.toLocaleString("en-US")} منتج
            </span>
          </Link>
        ))}
      </div>
      <div ref={sentinelRef} className="h-4" aria-hidden />
      {loadingMore && (
        <div className="mt-6 flex justify-center py-4">
          <LoadingDots className="scale-150" />
        </div>
      )}
    </div>
  );
}
