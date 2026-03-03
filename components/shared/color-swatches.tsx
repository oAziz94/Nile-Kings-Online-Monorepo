"use client";

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
}

const swatchSize = "h-6 w-6";

export function ColorSwatches({
  options,
  value,
  onSelect,
  className,
}: ColorSwatchesProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={opt.disabled}
          onClick={() => onSelect?.(opt.id)}
          title={opt.name}
          className={cn(
            "rounded-full border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            swatchSize,
            value === opt.id
              ? "border-foreground ring-2 ring-offset-2 ring-foreground/20"
              : "border-border hover:border-foreground/50",
            opt.disabled && "cursor-not-allowed opacity-50"
          )}
          style={{ backgroundColor: opt.hex }}
        />
      ))}
    </div>
  );
}
