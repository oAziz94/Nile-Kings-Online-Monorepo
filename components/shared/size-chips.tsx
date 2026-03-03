"use client";

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
}

export function SizeChips({ options, value, onSelect, className }: SizeChipsProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={opt.disabled}
          onClick={() => onSelect?.(opt.id)}
          className={cn(
            "rounded-2xl border px-3 py-1.5 text-sm font-medium transition-colors",
            "border-border bg-background hover:bg-accent hover:text-accent-foreground",
            value === opt.id && "border-primary bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
            opt.disabled && "cursor-not-allowed opacity-50"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
