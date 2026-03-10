"use client";

import { useState, useEffect, useRef } from "react";
import { ProductCard } from "@/components/shared/product-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductListItem } from "@/lib/catalog";

const ROTATE_INTERVAL_MS = 6000;
const DISPLAY_COUNT = 4;
const FADE_DURATION_MS = 400;

function toCardProps(p: ProductListItem) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    imageUrl: p.imageUrl,
    price: p.priceEgp,
    originalPrice: p.originalPriceEgp,
    discountPercent: p.discountPercent,
    colorVariants: p.colorVariants,
    inStock: p.inStock ?? true,
  };
}

interface RotatingProductGridProps {
  products: ProductListItem[];
  emptyTitle?: string;
  emptyDescription?: string;
}

export function RotatingProductGrid({
  products,
  emptyTitle = "لا توجد منتجات في هذا الكولكشن",
  emptyDescription = "تصفح التصنيفات الأخرى.",
}: RotatingProductGridProps) {
  const [startIndex, setStartIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const n = products.length;
  useEffect(() => {
    if (n <= DISPLAY_COUNT) return;
    const intervalId = setInterval(() => {
      setIsVisible(false);
      timeoutRef.current = setTimeout(() => {
        setStartIndex((prev) => (prev + DISPLAY_COUNT) % n);
        setIsVisible(true);
        timeoutRef.current = null;
      }, FADE_DURATION_MS);
    }, ROTATE_INTERVAL_MS);
    return () => {
      clearInterval(intervalId);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [n]);

  if (n === 0) {
    return (
      <EmptyState
        icon={<Package className="h-8 w-8" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  const display = Array.from({ length: DISPLAY_COUNT }, (_, i) => products[(startIndex + i) % n]);

  return (
    <div className="mx-auto max-w-5xl">
      <div
        className={cn(
          "grid grid-cols-1 justify-items-center gap-6 transition-opacity ease-out sm:grid-cols-2 lg:grid-cols-4",
          isVisible ? "opacity-100" : "opacity-0"
        )}
        style={{ transitionDuration: `${FADE_DURATION_MS}ms` }}
      >
        {display.map((p) => (
          <ProductCard
            key={p.id}
            className="w-full max-w-[280px]"
            {...toCardProps(p)}
          />
        ))}
      </div>
    </div>
  );
}
