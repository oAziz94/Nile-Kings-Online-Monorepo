import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StatusPill, type StatusPillTone } from "@/components/dashboard/status-pill";
import { formatNumberEn } from "@/lib/format-en-numbers";

/**
 * One اليوم queue group (backlog 5.2, `Main.dc.html`'s `queueGroup()`): a header with the
 * group title + a dotted count pill + "عرض الكل", up to three rows, then "و N أخرى". Renders
 * nothing when the group is empty — only groups with something to act on show up, matching
 * the artboard (it never draws an empty group).
 */
export function QueueGroupSection<T>({
  title,
  tone,
  count,
  rows,
  moreCount,
  viewAllHref,
  renderRow,
  rowKey,
  first,
  testId,
}: {
  title: string;
  tone: StatusPillTone;
  count: number;
  rows: T[];
  moreCount: number;
  viewAllHref: string;
  renderRow: (row: T, index: number) => React.ReactNode;
  /** Stable key + `data-testid` suffix per row (defaults to the row's index). */
  rowKey?: (row: T, index: number) => string;
  first?: boolean;
  testId?: string;
}) {
  if (count === 0) return null;

  return (
    <div className={first ? "" : "border-t border-stone-100"} data-testid={testId}>
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5 sm:px-5">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-extrabold text-ink">{title}</h3>
          <StatusPill tone={tone} data-testid={testId ? `${testId}-count` : undefined}>
            {count}
          </StatusPill>
        </div>
        <Link
          href={viewAllHref}
          className="flex shrink-0 items-center gap-1 text-xs font-bold text-lapis-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          عرض الكل
          <ArrowLeft className="h-3 w-3" />
        </Link>
      </div>
      {rows.map((row, i) => (
        <div
          key={rowKey ? rowKey(row, i) : i}
          className="border-t border-stone-100 px-4 py-2.5 sm:px-5"
          data-testid={rowKey ? `queue-row-${rowKey(row, i)}` : undefined}
        >
          {renderRow(row, i)}
        </div>
      ))}
      {moreCount > 0 && (
        <p className="border-t border-stone-100 px-4 py-2 text-xs text-ink-soft sm:px-5">
          و <span dir="ltr">{formatNumberEn(moreCount)}</span> أخرى
        </p>
      )}
    </div>
  );
}
