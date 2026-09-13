import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StatusPill, type StatusPillTone } from "@/components/dashboard/status-pill";
import { Skeleton } from "@/components/shared/skeleton";
import { cn } from "@/lib/utils";

/**
 * One اليوم queue card (backlog 9.2 a, `design-canvas/admin-v2/build.mjs`'s `q()`): an icon
 * well, title, count pill, "view all" link, up to three rows (primary · secondary ·
 * action). Unlike the partner's `QueueGroupSection` (which hides an empty group entirely),
 * an admin card with zero items still renders with "لا شيء يحتاجك هنا" — the admin needs to
 * see the card was checked, not that it vanished (PM ruling, backlog 9.2). Built as a
 * sibling of `QueueGroupSection` rather than an extension of it: the two differ in layout
 * (3-column card grid vs. one stacked panel) and in this empty-state behaviour, which
 * `QueueGroupSection`'s callers (اليوم's partner screen) must keep unchanged.
 */
export function AdminQueueCard<T>({
  title,
  tone,
  count,
  icon,
  viewAllHref,
  viewAllLabel,
  rows,
  renderRow,
  rowKey,
  loading,
  testId,
}: {
  title: string;
  tone: StatusPillTone;
  count: number;
  icon: React.ReactNode;
  viewAllHref: string;
  viewAllLabel: string;
  rows: T[];
  renderRow: (row: T, index: number) => React.ReactNode;
  rowKey: (row: T, index: number) => string;
  loading?: boolean;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-soft"
    >
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3.5 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gold-50 text-gold-600">
            {icon}
          </span>
          <h3 className="truncate text-[13.5px] font-extrabold text-ink">{title}</h3>
          {loading ? (
            <Skeleton className="h-5 w-8 rounded-full" />
          ) : (
            <StatusPill tone={tone} data-testid={`${testId}-count`}>
              {count}
            </StatusPill>
          )}
        </div>
        <Link
          href={viewAllHref}
          className="flex shrink-0 items-center gap-1 text-xs font-bold text-lapis-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
          {viewAllLabel}
          <ArrowLeft className="h-3 w-3" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2 px-4 pb-4 sm:px-5">
          <Skeleton className="h-9 w-full rounded-lg" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      ) : count === 0 ? (
        <p className="border-t border-stone-100 px-4 py-6 text-center text-sm text-ink-soft sm:px-5">
          لا شيء يحتاجك هنا
        </p>
      ) : (
        rows.map((row, i) => (
          <div
            key={rowKey(row, i)}
            className={cn("border-t border-stone-100 px-4 py-2.5 sm:px-5")}
            data-testid={`${testId}-row-${rowKey(row, i)}`}
          >
            {renderRow(row, i)}
          </div>
        ))
      )}
    </div>
  );
}
