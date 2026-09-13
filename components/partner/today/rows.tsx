"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { formatRelativeTimeAr } from "@/lib/format-relative-time-ar";
import { piastresToEgp } from "@/lib/catalog";
import type { PartnerTodayOrderRow, PartnerTodayRestockRow, PartnerTodayStockRow } from "@/hooks/use-partner-today";

/** One order row in an اليوم queue group — id, customer, address, total, relative time, and
 * a single next-action button that calls the existing transition endpoint. */
export function OrderQueueRow({
  row,
  actionLabel,
  onAction,
  pending,
}: {
  row: PartnerTodayOrderRow;
  actionLabel: string;
  onAction: () => void;
  pending: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap sm:gap-3.5">
      <span dir="ltr" className="shrink-0 text-xs font-bold text-ink-soft sm:w-20">
        #{row.id.slice(-6)}
      </span>
      <span className="min-w-0 shrink-0 truncate text-sm font-bold text-ink sm:w-40">{row.customerName}</span>
      <span className="min-w-0 shrink-0 truncate text-xs text-ink-soft sm:w-36">{row.addressLine}</span>
      <span dir="ltr" className="shrink-0 text-sm font-bold text-ink sm:w-24">
        {formatNumberEn(piastresToEgp(row.totalPiastres))} ج.م
      </span>
      <span className="min-w-0 flex-1 text-xs text-ink-soft">{formatRelativeTimeAr(row.enteredAt)}</span>
      <Button
        type="button"
        size="sm"
        onClick={onAction}
        disabled={pending}
        className="h-8 w-full shrink-0 rounded-full px-3 text-xs sm:w-auto"
      >
        {pending ? "..." : actionLabel}
      </Button>
    </div>
  );
}

/** A restock-request row (link only — needs judgement, not a one-click action). */
export function RestockQueueRow({ row, viewLabel = "عرض" }: { row: PartnerTodayRestockRow; viewLabel?: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="min-w-0">
        <span className="text-sm font-bold text-ink">{row.counterpartyName}</span>
        <span className="text-xs text-ink-soft"> · {formatNumberEn(row.itemCount)} صنف</span>
      </div>
      <span className="text-xs text-ink-soft">{formatRelativeTimeAr(row.occurredAt)}</span>
      <span className="text-xs font-bold text-lapis-800">{viewLabel}</span>
    </div>
  );
}

/** A low-stock row with an inline "+ كمية" quick-adjust (backlog 4.18's `delta` PATCH,
 * reused here rather than duplicated). */
export function LowStockQueueRow({
  row,
  onAdjust,
  pending,
}: {
  row: PartnerTodayStockRow;
  onAdjust: (amount: number) => void;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const inputId = React.useId();

  if (open) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = Number.parseInt(amount, 10);
          if (Number.isInteger(value) && value > 0) {
            onAdjust(value);
            setOpen(false);
            setAmount("");
          }
        }}
      >
        <label htmlFor={inputId} className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
          {row.productName} — {row.variantName}
        </label>
        <input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={1}
          autoFocus
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="h-8 w-20 rounded-lg border border-stone-200 px-2 text-sm"
          aria-label={`كمية إضافية لـ ${row.productName} — ${row.variantName}`}
        />
        <Button type="submit" size="sm" disabled={pending} className="h-8 rounded-full px-3 text-xs">
          {pending ? "..." : "إضافة"}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(false)} className="h-8 rounded-full px-3 text-xs">
          إلغاء
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:flex-nowrap sm:gap-3.5">
      <span className="min-w-0 shrink-0 truncate text-sm font-bold text-ink sm:w-48">
        {row.productName} — {row.variantName}
      </span>
      <span dir="ltr" className="shrink-0 text-sm font-bold text-ink sm:w-28">
        {formatNumberEn(row.sellable)} قابل للبيع
      </span>
      <span className="min-w-0 flex-1 text-xs text-ink-soft">
        الحد <span dir="ltr">{formatNumberEn(row.threshold)}</span>
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8 w-full shrink-0 rounded-full px-3 text-xs sm:w-auto"
      >
        + كمية
      </Button>
    </div>
  );
}
