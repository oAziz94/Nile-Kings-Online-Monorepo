import {
  AlertTriangle,
  Banknote,
  Boxes,
  Calendar,
  Package,
  ShoppingCart,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import { KpiCard, type KpiDeltaTone } from "@/components/dashboard/kpi-card";
import { piastresToEgp } from "@/lib/catalog";
import { formatNumberEn } from "@/lib/format-en-numbers";
import type { ReportHeadline } from "@/lib/analytics/partner-reports";

const HEADLINE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  revenue: TrendingUp,
  orders: ShoppingCart,
  units: Package,
  averageOrder: Wallet,
  cancellationRate: XCircle,
  sellable: Boxes,
  valuationCost: Banknote,
  valuationPrice: Banknote,
  medianCover: Calendar,
  deadStockCount: AlertTriangle,
  stockOutSkus: AlertTriangle,
};

/**
 * Headline tiles (backlog 5.6a) — one `KpiCard` per `ReportHeadline`, always with a delta
 * pill (rule 12: "every number ... has a period and a comparison, or it is not a report").
 * `higherIsBetter` flips the up/down colour semantics per headline (e.g. a rising
 * cancellation rate is "down"-coloured even though its `delta.direction` is "up").
 */
export function formatHeadlineValue(h: ReportHeadline): string {
  if (h.unit === "piastres") return `${formatNumberEn(piastresToEgp(h.value))} ج.م`;
  if (h.unit === "percent") return `${formatNumberEn(Number(h.value.toFixed(1)))}%`;
  if (h.unit === "days") return `${formatNumberEn(Number(h.value.toFixed(0)))} يوم`;
  return formatNumberEn(Math.round(h.value));
}

function formatDeltaText(h: ReportHeadline): string {
  if (h.delta.direction === "flat") return "—";
  const sign = h.delta.direction === "up" ? "+" : "";
  if (h.unit === "percent" || h.unit === "days") {
    return `${sign}${h.delta.changeAbs.toFixed(1)} ${h.unit === "percent" ? "نقطة" : "يوم"}`;
  }
  if (h.delta.changePct === null) return h.delta.direction === "up" ? "جديد" : "—";
  return `${sign}${Math.round(h.delta.changePct)}%`;
}

const GRID_COLS: Record<number, string> = {
  5: "lg:grid-cols-5",
  6: "lg:grid-cols-6",
};

export function HeadlineTiles({
  headline,
  higherIsBetter = {},
}: {
  headline: ReportHeadline[];
  /** key -> false when a rising value is *bad* (e.g. cancellation rate). Default true. */
  higherIsBetter?: Record<string, boolean>;
}) {
  const lgCols = GRID_COLS[headline.length] ?? "lg:grid-cols-5";
  return (
    <div className={`grid grid-cols-2 gap-4 sm:grid-cols-3 ${lgCols}`}>
      {headline.map((h) => {
        const better = higherIsBetter[h.key] ?? true;
        let tone: KpiDeltaTone = "flat";
        if (h.delta.direction !== "flat") {
          tone = (h.delta.direction === "up") === better ? "up" : "down";
        }
        const Icon = HEADLINE_ICONS[h.key] ?? TrendingUp;
        return (
          <KpiCard
            key={h.key}
            title={h.label}
            value={formatHeadlineValue(h)}
            icon={<Icon className="h-5 w-5" />}
            accent="gold"
            hint={h.hint}
            delta={h.noComparison ? undefined : { tone, text: formatDeltaText(h) }}
          />
        );
      })}
    </div>
  );
}
