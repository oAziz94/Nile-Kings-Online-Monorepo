"use client";

import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Rebuilt to `docs/redesign/design-canvas/PartnerOrders-Desktop.dc.html`'s `.panel-foot`
 * (30px square `pg-btn` numbered pages, lapis-800 active) — backlog 4.16. Same prop API
 * as before so admin call sites keep compiling and rendering unchanged.
 */
type PaginationBarProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  disabled?: boolean;
  pageSizeOptions?: number[];
  className?: string;
};

export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  disabled,
  pageSizeOptions = [10, 20, 50],
  className,
}: PaginationBarProps) {
  const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const from = total === 0 ? 0 : safePage * pageSize + 1;
  const to = Math.min(total, (safePage + 1) * pageSize);

  const pageButtons: number[] = [];
  const windowStart = Math.max(0, Math.min(safePage - 1, totalPages - 3));
  for (let i = windowStart; i < Math.min(totalPages, windowStart + 3); i++) pageButtons.push(i);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        className
      )}
    >
      <p className="text-[13px] text-ink-soft">
        {total === 0 ? "لا نتائج" : `عرض ${from}–${to} من ${total}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-[13px] text-ink-soft">عدد الصفوف</span>
            <Select
              value={String(pageSize)}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(0);
              }}
              disabled={disabled}
              className="w-[4.5rem]"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            aria-label="الصفحة السابقة"
            disabled={disabled || safePage <= 0}
            onClick={() => onPageChange(safePage - 1)}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-stone-100 text-[13px] font-bold text-ink-soft transition-colors hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-1 [&_svg]:scale-x-[-1]"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          {pageButtons.map((p) => (
            <button
              key={p}
              type="button"
              aria-current={p === safePage ? "page" : undefined}
              disabled={disabled}
              onClick={() => onPageChange(p)}
              className={cn(
                "flex h-[30px] w-[30px] items-center justify-center rounded-lg text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-1",
                p === safePage ? "bg-lapis-800 text-white" : "bg-stone-100 text-ink-soft hover:bg-stone-200"
              )}
            >
              {p + 1}
            </button>
          ))}
          <button
            type="button"
            aria-label="الصفحة التالية"
            disabled={disabled || safePage >= totalPages - 1}
            onClick={() => onPageChange(safePage + 1)}
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-stone-100 text-[13px] font-bold text-ink-soft transition-colors hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-1 [&_svg]:scale-x-[-1]"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
