"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type PeriodPreset = string;

export type PeriodBarPresetOption<TPreset extends PeriodPreset> = {
  id: TPreset;
  label: string;
};

/**
 * The period chip row (backlog 5.6a) — one chip per preset, "مخصص" opens two date inputs,
 * the comparison label to the right, and a toolbar slot for export/table-view actions on the
 * far side. Shared by both the sales and inventory reports (different preset sets).
 */
export function PeriodBar<TPreset extends PeriodPreset>({
  presets,
  preset,
  onPresetChange,
  from,
  to,
  onCustomRangeChange,
  comparisonLabel,
  toolbar,
  scopeControl,
}: {
  presets: PeriodBarPresetOption<TPreset>[];
  preset: TPreset;
  onPresetChange: (preset: TPreset) => void;
  from: string;
  to: string;
  onCustomRangeChange: (range: { from: string; to: string }) => void;
  comparisonLabel?: string;
  toolbar?: React.ReactNode;
  /** Backlog 10.13 — the sales report's المُنجَزة/النشطة segmented control, rendered inline
   * in the same row as the preset chips (a separate control, not another preset). */
  scopeControl?: React.ReactNode;
}) {
  const isCustom = preset === ("custom" as TPreset);
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-white p-3 shadow-soft sm:flex-row sm:flex-wrap sm:items-center">
      <div className="flex flex-wrap items-center gap-1">
        {presets.map((p) => (
          <button
            key={String(p.id)}
            type="button"
            onClick={() => {
              onPresetChange(p.id);
              // Backlog 10.8: "مخصص" with empty dates left the view showing an error (the query
              // waits for both dates, and "no data yet" rendered as a failure). Prefill the last
              // 30 days so the report loads at once; the shopper then narrows the dates.
              if ((p.id as string) === "custom" && (!from || !to)) {
                const today = new Date();
                const start = new Date(today);
                start.setDate(start.getDate() - 29);
                const iso = (d: Date) => d.toISOString().slice(0, 10);
                onCustomRangeChange({ from: from || iso(start), to: to || iso(today) });
              }
            }}
            aria-pressed={preset === p.id}
            className={cn(
              "inline-flex h-[30px] items-center rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2",
              preset === p.id
                ? "border-lapis-800 bg-lapis-800 text-white"
                : "border-stone-200 bg-white text-ink hover:bg-stone-50"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isCustom && (
        <div className="flex items-center gap-2">
          <Label htmlFor="report-period-from" className="sr-only">من</Label>
          <input
            id="report-period-from"
            type="date"
            className="h-8 rounded-lg border border-stone-200 px-2 text-xs"
            value={from}
            max={to}
            onChange={(e) => onCustomRangeChange({ from: e.target.value, to })}
          />
          <span className="text-xs text-ink-soft">إلى</span>
          <Label htmlFor="report-period-to" className="sr-only">إلى</Label>
          <input
            id="report-period-to"
            type="date"
            className="h-8 rounded-lg border border-stone-200 px-2 text-xs"
            value={to}
            min={from}
            onChange={(e) => onCustomRangeChange({ from, to: e.target.value })}
          />
        </div>
      )}

      {scopeControl}

      {comparisonLabel && <span className="text-xs text-ink-soft" dir="ltr" style={{ direction: "rtl" }}>{comparisonLabel}</span>}

      {toolbar && <div className="flex items-center gap-2 sm:mr-auto">{toolbar}</div>}
    </div>
  );
}

export function PeriodBarButton({
  children,
  onClick,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 rounded-lg text-xs" onClick={onClick}>
      {icon}
      {children}
    </Button>
  );
}
