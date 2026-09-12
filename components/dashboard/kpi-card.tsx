import { Skeleton } from "@/components/shared/skeleton";
import { cn } from "@/lib/utils";

/**
 * Rebuilt to `docs/redesign/design-canvas/PartnerOrders-Desktop.dc.html`'s `.stat` tile
 * (white, radius 12, gold-50 icon well, 25px/800 value) — backlog 4.16. Same prop API as
 * before (`accent` keys unchanged: burgundy/gold/emerald/slate) so admin call sites keep
 * compiling; the four accents now map onto the pharaonic tokens instead of the old ones.
 */
export type KpiAccent = "burgundy" | "gold" | "emerald" | "slate";

const accentStyles: Record<KpiAccent, string> = {
  burgundy: "bg-lapis-800/10 text-lapis-800",
  gold: "bg-gold-50 text-gold-600",
  emerald: "bg-malachite-bg text-malachite-text",
  slate: "bg-stone-100 text-ink-soft",
};

export function KpiCard({
  title,
  value,
  hint,
  icon,
  accent = "gold",
  loading,
  footer,
  className,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  accent?: KpiAccent;
  loading?: boolean;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-stone-200 bg-white p-[18px] px-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-ink-soft">{title}</p>
          {loading ? (
            <Skeleton className="mt-3 h-7 w-24" />
          ) : (
            <p className="mt-2 text-[25px] font-extrabold tracking-tight text-ink">{value}</p>
          )}
          {hint && <p className="mt-2 text-xs leading-relaxed text-ink-soft">{hint}</p>}
          {footer}
        </div>
        <div
          className={cn(
            "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px]",
            accentStyles[accent]
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
