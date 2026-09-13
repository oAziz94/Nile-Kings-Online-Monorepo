import { Skeleton } from "@/components/shared/skeleton";
import { cn } from "@/lib/utils";

/**
 * Rebuilt to `design-canvas/partner-v2/build.mjs`'s KPI tile (white radius-16 card, soft
 * shadow, 40px gold-50 icon well radius-12, 26px/800 value, optional delta pill) —
 * backlog 5.1. Same prop API as before (`accent` keys unchanged: burgundy/gold/emerald/
 * slate) plus an additive `delta` prop (`tone`: up/down/flat) so admin call sites keep
 * compiling; the four accents now map onto the pharaonic tokens instead of the old ones.
 */
export type KpiAccent = "burgundy" | "gold" | "emerald" | "slate";

const accentStyles: Record<KpiAccent, string> = {
  burgundy: "bg-lapis-800/10 text-lapis-800",
  gold: "bg-gold-50 text-gold-600",
  emerald: "bg-malachite-bg text-malachite-text",
  slate: "bg-stone-100 text-ink-soft",
};

export type KpiDeltaTone = "up" | "down" | "flat";

const deltaStyles: Record<KpiDeltaTone, string> = {
  up: "bg-malachite-bg text-malachite-text",
  down: "bg-danger-bg text-danger-text",
  flat: "bg-stone-100 text-ink-soft",
};

export function KpiDeltaPill({ tone, children }: { tone: KpiDeltaTone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold",
        deltaStyles[tone]
      )}
    >
      <span dir="ltr">{children}</span>
    </span>
  );
}

export function KpiCard({
  title,
  value,
  hint,
  icon,
  accent = "gold",
  loading,
  footer,
  delta,
  className,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  accent?: KpiAccent;
  loading?: boolean;
  footer?: React.ReactNode;
  /** Optional delta pill vs. the previous period (backlog 5.1's KPI tiles). */
  delta?: { tone: KpiDeltaTone; text: string };
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl bg-white p-5 shadow-soft", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-ink-soft">{title}</p>
          {loading ? (
            <Skeleton className="mt-3 h-7 w-24" />
          ) : (
            <p className="mt-2 text-[26px] font-extrabold tracking-tight text-ink">{value}</p>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            {hint && <p className="text-xs leading-relaxed text-ink-soft">{hint}</p>}
            {!loading && delta && <KpiDeltaPill tone={delta.tone}>{delta.text}</KpiDeltaPill>}
          </div>
          {footer}
        </div>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            accentStyles[accent]
          )}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
