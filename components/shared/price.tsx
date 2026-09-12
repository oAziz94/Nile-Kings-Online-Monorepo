import { cn } from "@/lib/utils";

interface PriceProps {
  amount: number;
  currency?: string;
  originalAmount?: number;
  discountPercent?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg font-semibold",
};

const originalSizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

/**
 * Price display — backlog 4.6: Archivo digits (Western numerals, forced `direction:ltr` so the
 * number itself never reverses inside the RTL flow), `ج.م` set in the body face (Plex Arabic),
 * a strikethrough on the original price when discounted, and an ink discount pill.
 */
export function Price({
  amount,
  currency = "ج.م",
  originalAmount,
  discountPercent,
  size = "md",
  className,
}: PriceProps) {
  const hasDiscount = originalAmount != null && originalAmount > amount;
  const percent =
    discountPercent ??
    (hasDiscount && originalAmount
      ? Math.round(((originalAmount - amount) / originalAmount) * 100)
      : undefined);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {hasDiscount && (
        <span
          className={cn(
            "font-plex-arabic text-[hsl(228_18%_50%)] line-through",
            originalSizeClasses[size]
          )}
        >
          <span className="font-archivo" style={{ direction: "ltr" }}>
            {originalAmount!.toLocaleString("en-US")}
          </span>{" "}
          {currency}
        </span>
      )}
      <span className={cn("font-medium text-[hsl(228_40%_14%)]", sizeClasses[size])}>
        <span className="font-archivo" style={{ direction: "ltr" }}>
          {amount.toLocaleString("en-US")}
        </span>{" "}
        <span className="font-plex-arabic">{currency}</span>
      </span>
      {percent != null && percent > 0 && (
        <span className="rounded-none bg-[hsl(228_40%_14%)] px-1.5 py-0.5 font-archivo text-xs font-medium text-papyrus" style={{ direction: "ltr" }}>
          -{percent.toLocaleString("en-US")}%
        </span>
      )}
    </div>
  );
}
