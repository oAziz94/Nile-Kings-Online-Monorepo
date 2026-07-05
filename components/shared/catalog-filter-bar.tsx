"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type CatalogFilterCategory = {
  id: string;
  name: string;
  slug: string;
  productCount?: number;
};

type CatalogFilterBarProps = {
  search: string;
  category?: string;
  size?: string;
  categories?: CatalogFilterCategory[];
  sizes: string[];
  total?: number;
  loading?: boolean;
  showCategory?: boolean;
  className?: string;
  onSearchChange: (value: string) => void;
  onCategoryChange?: (value: string) => void;
  onSizeChange: (value: string) => void;
  onClear: () => void;
};

export function CatalogFilterBar({
  search,
  category = "",
  size = "",
  categories = [],
  sizes,
  total,
  loading,
  showCategory = true,
  className,
  onSearchChange,
  onCategoryChange,
  onSizeChange,
  onClear,
}: CatalogFilterBarProps) {
  const hasFilters = Boolean(search.trim() || category || size);

  return (
    <div
      className={cn(
        "mb-6 overflow-hidden rounded-[1.5rem] border border-border/80 bg-card/90 shadow-[0_18px_60px_rgba(28,28,28,0.08)]",
        className
      )}
    >
      <div className="border-b border-border/70 bg-[linear-gradient(135deg,hsl(var(--foreground))_0%,hsl(var(--burgundy))_100%)] px-4 py-4 text-primary-foreground md:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/12 ring-1 ring-white/20">
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold">فلترة المنتجات</p>
              <p className="text-xs text-primary-foreground/70">
                ابحث واختار التصنيف والمقاس المناسب
              </p>
            </div>
          </div>
          <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs">
            {loading
              ? "جاري التحميل"
              : `${(total ?? 0).toLocaleString("en-US")} نتيجة`}
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-[minmax(220px,1fr)_180px_150px_auto] md:items-center md:p-5">
        <label className="relative block">
          <span className="sr-only">بحث</span>
          <Search className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ابحث باسم المنتج..."
            className="h-12 w-full rounded-2xl border border-input bg-background px-11 py-2 text-sm text-foreground shadow-inner outline-none transition focus:border-foreground focus:ring-2 focus:ring-foreground/10"
          />
        </label>

        {showCategory ? (
          <Select
            value={category}
            onChange={(e) => onCategoryChange?.(e.target.value)}
            className="h-12 rounded-2xl bg-background shadow-inner"
            aria-label="التصنيف"
          >
            <option value="">كل التصنيفات</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        ) : null}

        <Select
          value={size}
          onChange={(e) => onSizeChange(e.target.value)}
          className="h-12 rounded-2xl bg-background shadow-inner"
          aria-label="المقاس"
        >
          <option value="">كل المقاسات</option>
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>

        <Button
          type="button"
          variant={hasFilters ? "outline" : "ghost"}
          className="h-12 rounded-2xl"
          onClick={onClear}
          disabled={!hasFilters}
        >
          <X className="h-4 w-4" aria-hidden />
          مسح
        </Button>
      </div>
    </div>
  );
}
