"use client";

import { useRef, useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortOptionValue =
  | "featured"
  | "best_sales"
  | "name_ar"
  | "name_za"
  | "price_asc"
  | "price_desc"
  | "date_asc"
  | "date_desc";

export const SORT_OPTIONS: { value: SortOptionValue; label: string }[] = [
  { value: "featured", label: "فيتشر" },
  { value: "best_sales", label: "أفضل مبيعات" },
  { value: "name_ar", label: "ابجديا، من الالف للياء" },
  { value: "name_za", label: "أبجديا، Z-A" },
  { value: "price_asc", label: "السعر من الارخص للاعلى" },
  { value: "price_desc", label: "السعر الاعلى الى الادنى" },
  { value: "date_asc", label: "التاريخ، من القديم إلى الجديد" },
  { value: "date_desc", label: "التاريخ، الجديد إلى القديم" },
];

export interface SortDropdownProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Optional: base path for links (e.g. /products or /categories/kids). Used to keep URL in sync. */
  basePath?: string;
}

export function SortDropdown({
  value,
  onChange,
  className,
}: SortDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentOption =
    SORT_OPTIONS.find((o) => o.value === value) ?? SORT_OPTIONS[0];
  const displayValue = currentOption.label;

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative inline-block", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full min-w-[200px] max-w-[280px] items-center justify-between gap-2 rounded-xl border border-input bg-background px-4 py-3 text-sm text-foreground shadow-sm transition-colors hover:bg-accent/50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="ترتيب المنتجات"
      >
        <span className="truncate text-start">{displayValue}</span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="خيارات الترتيب"
          className="absolute top-full left-0 z-50 mt-1.5 w-full min-w-[200px] max-w-[280px] rounded-xl border border-border bg-popover py-1 shadow-lg"
          style={{
            boxShadow:
              "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
          }}
        >
          {/* Pointer triangle */}
          <div
            className="absolute -top-1.5 right-4 h-3 w-3 rotate-45 border-l border-t border-border bg-popover"
            aria-hidden
          />
          <div className="relative overflow-hidden rounded-xl py-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={value === opt.value}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full px-4 py-2.5 text-start text-sm transition-colors",
                  value === opt.value
                    ? "bg-muted font-medium text-foreground"
                    : "text-foreground hover:bg-accent/50"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
