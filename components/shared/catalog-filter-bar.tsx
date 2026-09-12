"use client";

import { Search, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { SortDropdown, type SortOptionValue } from "@/components/shared/sort-dropdown";
import { PriceRangeControl, type PriceRangeValue } from "@/components/shared/price-range-control";
import { cn } from "@/lib/utils";

export type CatalogFilterCategory = {
  id: string;
  name: string;
  slug: string;
  productCount?: number;
};

interface CatalogFilterBarProps {
  search: string;
  category?: string;
  size?: string;
  categories?: CatalogFilterCategory[];
  sizes: string[];
  priceRange: PriceRangeValue;
  priceBounds: PriceRangeValue;
  priceBoundsReady: boolean;
  inStock: boolean;
  sort: SortOptionValue;
  showCategory?: boolean;
  hasActiveFilters: boolean;
  className?: string;
  onSearchChange: (value: string) => void;
  onCategoryChange?: (value: string) => void;
  onSizeChange: (value: string) => void;
  onPriceChange: (value: PriceRangeValue) => void;
  onInStockChange: (value: boolean) => void;
  onSortChange: (value: SortOptionValue) => void;
  onClear: () => void;
}

/**
 * Desktop/tablet filter bar — backlog 4.8, artboard 1c: search, category (unscoped route only),
 * size, price range (exposed for the first time — `products-listing.md`'s friction point), an
 * "in stock only" switch, sort (all 8 existing options), and a clear button. Hidden below `md`;
 * `CatalogMobileFilters` covers the phone layout (1d/1e) with the same controls in a sheet.
 */
export function CatalogFilterBar({
  search,
  category = "",
  size = "",
  categories = [],
  sizes,
  priceRange,
  priceBounds,
  priceBoundsReady,
  inStock,
  sort,
  showCategory = true,
  hasActiveFilters,
  className,
  onSearchChange,
  onCategoryChange,
  onSizeChange,
  onPriceChange,
  onInStockChange,
  onSortChange,
  onClear,
}: CatalogFilterBarProps) {
  return (
    <div
      className={cn(
        "hidden border border-[hsl(228_16%_88%)] bg-papyrus p-4 md:flex md:flex-wrap md:items-end md:gap-4",
        className
      )}
    >
      <div className="flex min-w-[220px] flex-1 flex-col gap-1.5">
        <Label htmlFor="catalog-search" className="text-xs font-medium text-[hsl(228_18%_40%)]">
          بحث
        </Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            id="catalog-search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="ابحث عن منتج أو علامة"
            className="h-10 w-full rounded-none border border-input bg-background ps-3 pe-9 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>

      {showCategory ? (
        <div className="flex w-[160px] flex-col gap-1.5">
          <Label htmlFor="catalog-category" className="text-xs font-medium text-[hsl(228_18%_40%)]">
            الفئة
          </Label>
          <Select
            id="catalog-category"
            value={category}
            onChange={(e) => onCategoryChange?.(e.target.value)}
            className="h-10 rounded-none bg-background"
          >
            <option value="">كل الفئات</option>
            {categories.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
      ) : null}

      <div className="flex w-[140px] flex-col gap-1.5">
        <Label htmlFor="catalog-size" className="text-xs font-medium text-[hsl(228_18%_40%)]">
          المقاس
        </Label>
        <Select
          id="catalog-size"
          value={size}
          onChange={(e) => onSizeChange(e.target.value)}
          className="h-10 rounded-none bg-background"
        >
          <option value="">كل المقاسات</option>
          {sizes.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      <PriceRangeControl
        idPrefix="catalog-desktop"
        value={priceRange}
        bounds={priceBounds}
        disabled={!priceBoundsReady}
        onChange={onPriceChange}
        className="w-[190px]"
      />

      <div className="flex flex-col items-start gap-1.5">
        <Label htmlFor="catalog-in-stock" className="text-xs font-medium text-[hsl(228_18%_40%)]">
          المتوفر فقط
        </Label>
        <Switch id="catalog-in-stock" checked={inStock} onCheckedChange={onInStockChange} />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-[hsl(228_18%_40%)]">ترتيب</span>
        <SortDropdown value={sort} onChange={(v) => onSortChange(v as SortOptionValue)} className="min-w-[170px]" />
      </div>

      <Button
        type="button"
        variant={hasActiveFilters ? "outline" : "ghost"}
        className="h-10 rounded-none"
        onClick={onClear}
        disabled={!hasActiveFilters}
      >
        <X className="h-4 w-4" aria-hidden />
        مسح الفلاتر
      </Button>
    </div>
  );
}
