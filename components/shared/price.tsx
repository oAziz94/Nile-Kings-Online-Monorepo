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

export function Price({
  amount,
  currency = "ج.م",
  originalAmount,
  discountPercent,
  size = "md",
  className,
}: PriceProps) {
  const hasDiscount = originalAmount != null && originalAmount > amount;
  const percent = discountPercent ?? (hasDiscount && originalAmount
    ? Math.round(((originalAmount - amount) / originalAmount) * 100)
    : undefined);

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {hasDiscount && (
        <span className={cn("text-muted-foreground line-through", size === "lg" ? "text-base" : "text-sm")}>
          {originalAmount!.toLocaleString("en-US")} {currency}
        </span>
      )}
      <span className={cn("font-medium text-foreground", sizeClasses[size])}>
        {amount.toLocaleString("en-US")} {currency}
      </span>
      {percent != null && percent > 0 && (
        <span className="rounded-md bg-burgundy/15 px-1.5 py-0.5 text-xs font-medium text-burgundy">
          -{percent.toLocaleString("en-US")}%
        </span>
      )}
    </div>
  );
}
