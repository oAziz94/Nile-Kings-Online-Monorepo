"use client";

import { cn } from "@/lib/utils";

export interface PriceRangeValue {
  min: number;
  max: number;
}

interface PriceRangeControlProps {
  /** Current selected range (always within `bounds`). */
  value: PriceRangeValue;
  /** The catalog's real min/max for the current scope — never hardcoded by the caller. */
  bounds: PriceRangeValue;
  onChange: (next: PriceRangeValue) => void;
  idPrefix: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Price range filter — two Archivo number inputs (exact values) plus a dual-thumb slider built
 * from two overlapping native `<input type="range">`s (each keyboard-operable and independently
 * labelled; only the thumb, not the track, is pointer-interactive — see `.nk-range-thumb` in
 * `app/globals.css`). Values are always in EGP, matching `lib/catalog.ts`'s `ProductsQuery`.
 */
export function PriceRangeControl({
  value,
  bounds,
  onChange,
  idPrefix,
  disabled,
  className,
}: PriceRangeControlProps) {
  const boundsMin = bounds.min;
  const boundsMax = Math.max(bounds.max, boundsMin + 1);
  const span = boundsMax - boundsMin || 1;

  function commitMin(raw: number) {
    if (Number.isNaN(raw)) return;
    const next = Math.min(Math.max(raw, boundsMin), value.max);
    onChange({ min: next, max: value.max });
  }

  function commitMax(raw: number) {
    if (Number.isNaN(raw)) return;
    const next = Math.max(Math.min(raw, boundsMax), value.min);
    onChange({ min: value.min, max: next });
  }

  const minPct = ((value.min - boundsMin) / span) * 100;
  const maxPct = ((value.max - boundsMin) / span) * 100;

  return (
    // The whole control (numbers + slider) is one consistent LTR block — min always at the
    // visual left, max at the right, matching the slider thumbs it sits above. Splitting
    // direction between the two rows (one RTL, one forced LTR) made them visually disagree.
    <div className={cn("flex flex-col gap-2", className)} dir="ltr">
      <span className="text-xs font-medium text-[hsl(228_18%_40%)]" dir="rtl">
        السعر (ج.م)
      </span>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor={`${idPrefix}-price-min-input`}>
          الحد الأدنى للسعر
        </label>
        <input
          id={`${idPrefix}-price-min-input`}
          type="number"
          inputMode="numeric"
          dir="ltr"
          disabled={disabled}
          className="h-10 w-[4.5rem] rounded-none border border-input bg-background px-2 font-archivo text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          style={{ direction: "ltr" }}
          value={value.min}
          min={boundsMin}
          max={value.max}
          onChange={(e) => commitMin(Number(e.target.value))}
        />
        <span aria-hidden className="text-xs text-muted-foreground">
          –
        </span>
        <label className="sr-only" htmlFor={`${idPrefix}-price-max-input`}>
          الحد الأقصى للسعر
        </label>
        <input
          id={`${idPrefix}-price-max-input`}
          type="number"
          inputMode="numeric"
          dir="ltr"
          disabled={disabled}
          className="h-10 w-[4.5rem] rounded-none border border-input bg-background px-2 font-archivo text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          style={{ direction: "ltr" }}
          value={value.max}
          min={value.min}
          max={boundsMax}
          onChange={(e) => commitMax(Number(e.target.value))}
        />
      </div>
      <div className="relative h-5 px-0.5" dir="ltr">
        <div className="pointer-events-none absolute inset-x-0.5 top-1/2 h-1 -translate-y-1/2 bg-[hsl(228_16%_85%)]" />
        <div
          className="pointer-events-none absolute top-1/2 h-1 -translate-y-1/2 bg-[hsl(228_40%_14%)]"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <label className="sr-only" htmlFor={`${idPrefix}-price-min-range`}>
          شريط الحد الأدنى للسعر
        </label>
        <input
          id={`${idPrefix}-price-min-range`}
          type="range"
          disabled={disabled}
          min={boundsMin}
          max={boundsMax}
          value={value.min}
          onChange={(e) => commitMin(Number(e.target.value))}
          className="nk-range-thumb pointer-events-none absolute inset-x-0 top-1/2 h-1 w-full -translate-y-1/2 appearance-none bg-transparent"
        />
        <label className="sr-only" htmlFor={`${idPrefix}-price-max-range`}>
          شريط الحد الأقصى للسعر
        </label>
        <input
          id={`${idPrefix}-price-max-range`}
          type="range"
          disabled={disabled}
          min={boundsMin}
          max={boundsMax}
          value={value.max}
          onChange={(e) => commitMax(Number(e.target.value))}
          className="nk-range-thumb pointer-events-none absolute inset-x-0 top-1/2 h-1 w-full -translate-y-1/2 appearance-none bg-transparent"
        />
      </div>
    </div>
  );
}
