import { formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";
import type { RestockRequestItem } from "./types";

/**
 * Shared item-line renderer (backlog 4.20's "shared view model") — used by both the
 * distributor's past-requests table and the agent's request cards, and reused inside
 * the fulfill confirmation dialog. `showDestinationStock` renders the agent-only inline
 * distributor-stock line (backlog 4.20 (b)).
 */
export function RestockItemLines({
  items,
  showDestinationStock = false,
  dense = false,
  className,
}: {
  items: RestockRequestItem[];
  showDestinationStock?: boolean;
  dense?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2",
            dense ? "text-xs" : "text-sm"
          )}
        >
          <span className="min-w-0 truncate text-ink">
            {item.variant.product.name} · {item.variant.sku}
            {item.variant.colorName ? ` · ${item.variant.colorName}` : ""}
          </span>
          <span className="flex shrink-0 items-center gap-3">
            {showDestinationStock && item.destinationStock && (
              <span dir="ltr" className="text-[11px] font-semibold text-ink-soft">
                متاح لدى الموزع: {formatNumberEn(item.destinationStock.stockAvailable)} · محجوز:{" "}
                {formatNumberEn(item.destinationStock.stockReserved)}
              </span>
            )}
            <span dir="ltr" className="font-extrabold text-ink">
              × {formatNumberEn(item.quantity)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}
