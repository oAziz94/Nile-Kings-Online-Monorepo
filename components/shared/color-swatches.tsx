"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

export interface ColorOption {
  id: string;
  name: string;
  hex: string;
  disabled?: boolean;
}

interface ColorSwatchesProps {
  options: ColorOption[];
  value?: string;
  onSelect?: (id: string) => void;
  className?: string;
  /** "circle" (default) or "square" */
  shape?: "circle" | "square";
  /** Accessible name for the radiogroup — defaults to "اللون". */
  ariaLabel?: string;
  /** Backlog 10.2 — hover/focus preview (PDP only; optional so `QuickShopModal` is unaffected).
   *  Fired on `onMouseEnter`/`onFocus`; the caller decides whether that colour has a preview
   *  image at all. Not a selection — `aria-checked` does not change until `onSelect` fires. */
  onPreview?: (id: string) => void;
  /** `onMouseLeave`/`onBlur` — restores whatever was showing before the preview. */
  onPreviewEnd?: () => void;
}

const swatchSize = "h-8 w-8";

/** Colour selector as a real `radiogroup` (backlog 4.9) — arrow-key roving tabindex navigation. */
export function ColorSwatches({
  options,
  value,
  onSelect,
  className,
  shape = "circle",
  ariaLabel = "اللون",
  onPreview,
  onPreviewEnd,
}: ColorSwatchesProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const firstEnabledId = options.find((o) => !o.disabled)?.id;

  function focusByOffset(currentId: string, offset: number) {
    const idx = options.findIndex((o) => o.id === currentId);
    if (idx === -1) return;
    let next = idx;
    for (let i = 0; i < options.length; i++) {
      next = (next + offset + options.length) % options.length;
      if (!options[next].disabled) break;
    }
    const target = options[next];
    refs.current[target.id]?.focus();
    onSelect?.(target.id);
  }

  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-wrap gap-2.5", className)}>
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <button
            key={opt.id}
            ref={(el) => {
              refs.current[opt.id] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={opt.disabled || undefined}
            aria-label={opt.name}
            title={opt.name}
            tabIndex={selected || (value == null && opt.id === firstEnabledId) ? 0 : -1}
            onClick={() => !opt.disabled && onSelect?.(opt.id)}
            onMouseEnter={() => !opt.disabled && onPreview?.(opt.id)}
            onMouseLeave={() => onPreviewEnd?.()}
            onFocus={() => !opt.disabled && onPreview?.(opt.id)}
            onBlur={() => onPreviewEnd?.()}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                focusByOffset(opt.id, 1);
              } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                focusByOffset(opt.id, -1);
              }
            }}
            className={cn(
              "border transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2",
              swatchSize,
              shape === "square" ? "rounded-md" : "rounded-full",
              selected
                ? "border-[hsl(228_40%_14%)] shadow-[0_0_0_2px_#F7F4EE,0_0_0_3px_hsl(228_40%_14%)]"
                : "border-[hsl(228_16%_78%)] hover:scale-110",
              opt.disabled && "cursor-not-allowed opacity-40"
            )}
            style={{ backgroundColor: opt.hex }}
          />
        );
      })}
    </div>
  );
}
