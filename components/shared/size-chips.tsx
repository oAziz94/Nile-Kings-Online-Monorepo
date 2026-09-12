"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

export interface SizeOption {
  id: string;
  label: string;
  disabled?: boolean;
}

interface SizeChipsProps {
  options: SizeOption[];
  value?: string;
  onSelect?: (id: string) => void;
  className?: string;
  /** Accessible name for the radiogroup — defaults to "المقاس". */
  ariaLabel?: string;
}

/**
 * Size selector as a real `radiogroup` (backlog 4.9) — arrow-key roving tabindex navigation,
 * out-of-stock sizes stay visible (struck through) rather than hidden, per the canvas and the
 * feature inventory's "always show all sizes, disable unavailable ones" rule.
 */
export function SizeChips({ options, value, onSelect, className, ariaLabel = "المقاس" }: SizeChipsProps) {
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
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-wrap gap-2", className)}>
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
            aria-label={opt.disabled ? `${opt.label} — غير متوفر` : opt.label}
            tabIndex={selected || (value == null && opt.id === firstEnabledId) ? 0 : -1}
            onClick={() => !opt.disabled && onSelect?.(opt.id)}
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
              "h-[46px] min-w-[56px] border px-3.5 font-archivo text-sm font-medium transition-colors",
              "border-[hsl(228_40%_14%)]/30 bg-transparent text-[hsl(228_40%_14%)]",
              selected && "border-[hsl(228_40%_14%)] bg-[hsl(228_40%_14%)] text-papyrus",
              opt.disabled &&
                "cursor-not-allowed border-[hsl(228_16%_84%)] text-[hsl(228_18%_60%)] line-through"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
