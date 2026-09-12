"use client";

import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { SortDropdown, type SortOptionValue } from "@/components/shared/sort-dropdown";
import { PriceRangeControl, type PriceRangeValue } from "@/components/shared/price-range-control";
import type { CatalogFilterCategory } from "@/components/shared/catalog-filter-bar";
import { cn } from "@/lib/utils";

export interface CatalogDraftFilters {
  category: string;
  size: string;
  priceRange: PriceRangeValue;
  inStock: boolean;
  sort: SortOptionValue;
}

interface CatalogMobileFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: SortOptionValue;
  onSortChange: (value: SortOptionValue) => void;
  categories?: CatalogFilterCategory[];
  showCategory?: boolean;
  sizes: string[];
  priceBounds: PriceRangeValue;
  priceBoundsReady: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: CatalogDraftFilters;
  onDraftChange: (draft: CatalogDraftFilters) => void;
  activeFilterCount: number;
  previewTotal: number | null;
  onApply: () => void;
  onClear: () => void;
  className?: string;
}

/**
 * Mobile controls — backlog 4.8, artboards 1d/1e: a search input, a sort select, and a "تصفية"
 * button carrying the active-filter count that opens a bottom-sheet dialog. Unlike the desktop
 * bar (which applies every change live), the sheet only commits on "عرض N منتجًا" — the draft
 * lives here until Apply, matching the canvas's mobile interaction.
 */
export function CatalogMobileFilters({
  search,
  onSearchChange,
  sort,
  onSortChange,
  categories = [],
  showCategory = true,
  sizes,
  priceBounds,
  priceBoundsReady,
  open,
  onOpenChange,
  draft,
  onDraftChange,
  activeFilterCount,
  previewTotal,
  onApply,
  onClear,
  className,
}: CatalogMobileFiltersProps) {
  function update(partial: Partial<CatalogDraftFilters>) {
    onDraftChange({ ...draft, ...partial });
  }

  return (
    <div className={cn("flex flex-col gap-2 md:hidden", className)}>
      <div className="relative">
        <Label htmlFor="catalog-search-mobile" className="sr-only">
          بحث
        </Label>
        <Search
          className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          id="catalog-search-mobile"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="ابحث عن منتج أو علامة"
          className="h-11 w-full rounded-none border border-input bg-background ps-3 pe-9 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex items-center gap-2">
        <SortDropdown
          value={sort}
          onChange={(v) => onSortChange(v as SortOptionValue)}
          className="flex-1 min-w-0"
        />

        <Sheet open={open} onOpenChange={onOpenChange}>
          <Button
            type="button"
            variant="outline"
            className="relative h-10 shrink-0 gap-1.5 rounded-none"
            onClick={() => onOpenChange(true)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            تصفية
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[hsl(228_40%_14%)] px-1 font-archivo text-[11px] font-semibold text-papyrus">
                {activeFilterCount}
              </span>
            )}
          </Button>

          <SheetContent side="bottom" className="max-h-[92vh] gap-0 overflow-y-auto p-0">
            <div className="flex items-center justify-between border-b border-[hsl(228_16%_88%)] p-4">
              <SheetTitle>تصفية</SheetTitle>
              <SheetClose asChild>
                <button
                  type="button"
                  aria-label="إغلاق التصفية"
                  className="flex h-8 w-8 items-center justify-center text-[hsl(228_18%_40%)] hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </SheetClose>
            </div>

            <div className="flex flex-col gap-5 overflow-y-auto p-4">
              {showCategory ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="catalog-category-mobile" className="text-xs font-medium text-[hsl(228_18%_40%)]">
                    الفئة
                  </Label>
                  <Select
                    id="catalog-category-mobile"
                    value={draft.category}
                    onChange={(e) => update({ category: e.target.value })}
                    className="h-11 rounded-none bg-background"
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

              <fieldset className="flex flex-col gap-2">
                <legend className="text-xs font-medium text-[hsl(228_18%_40%)]">المقاس</legend>
                <div className="flex flex-wrap gap-2" role="group" aria-label="المقاس">
                  {sizes.map((s) => {
                    const selected = draft.size === s;
                    return (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => update({ size: selected ? "" : s })}
                        className={cn(
                          "h-9 min-w-9 border px-3 font-archivo text-sm transition-colors",
                          selected
                            ? "border-[hsl(228_40%_14%)] bg-[hsl(228_40%_14%)] text-papyrus"
                            : "border-[hsl(228_16%_82%)] bg-background text-foreground hover:border-[hsl(228_40%_14%)]"
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <PriceRangeControl
                idPrefix="catalog-mobile"
                value={draft.priceRange}
                bounds={priceBounds}
                disabled={!priceBoundsReady}
                onChange={(v) => update({ priceRange: v })}
              />

              <div className="flex items-center justify-between">
                <Label htmlFor="catalog-in-stock-mobile" className="text-sm font-medium text-foreground">
                  المتوفر فقط
                </Label>
                <Switch
                  id="catalog-in-stock-mobile"
                  checked={draft.inStock}
                  onCheckedChange={(v) => update({ inStock: v })}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-[hsl(228_18%_40%)]">ترتيب</span>
                <SortDropdown value={draft.sort} onChange={(v) => update({ sort: v as SortOptionValue })} />
              </div>
            </div>

            <div className="flex shrink-0 gap-2 border-t border-[hsl(228_16%_88%)] p-4">
              <Button
                type="button"
                variant="outline"
                className="rounded-none"
                onClick={() => {
                  onClear();
                  onOpenChange(false);
                }}
              >
                مسح
              </Button>
              <SheetClose asChild>
                <Button
                  type="button"
                  className="flex-1 rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]"
                  onClick={onApply}
                >
                  {previewTotal == null ? "عرض المنتجات" : `عرض ${previewTotal.toLocaleString("en-US")} منتجًا`}
                </Button>
              </SheetClose>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
