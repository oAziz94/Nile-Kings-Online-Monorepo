
export type BarListRow = { key: string; label: string; value: number; valueText: string; detail?: string };

/**
 * Horizontal bar list (backlog 11.5) for ranked categories (sizes, colours, hours): one hue
 * for magnitude, rows keep the order the caller ranked them in, the value is a direct label on
 * the row (no legend, no axis), and the same figures are always available as a table in the
 * report's breakdown tabs. Bars are CSS, not a chart library.
 */
export function BarList({ rows, ariaLabel }: { rows: BarListRow[]; ariaLabel: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className="text-xs text-ink-soft">لا توجد مبيعات في الفترة المحددة.</p>;
  return (
    <ul aria-label={ariaLabel} className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1" data-testid="bar-list-row">
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-semibold text-ink">{r.label}</span>
            <span dir="ltr" className="shrink-0 font-bold text-ink">
              {r.valueText}
              {r.detail && <span className="ms-1.5 font-normal text-ink-soft">{r.detail}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-stone-100" aria-hidden="true">
            <div className="h-full rounded-full bg-lapis-800" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
