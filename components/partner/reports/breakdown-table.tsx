"use client";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Button } from "@/components/ui/button";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { BarChart3, ChevronLeft, ChevronRight } from "lucide-react";
import type { ReportBreakdownPage } from "@/lib/analytics/partner-reports";

/**
 * Server-paginated breakdown table shell (backlog 5.6a — "tables >200 rows are server-
 * paginated (page size 25)"). Presentational only; callers supply columns + rows, this
 * component owns the page-size-25 footer and the empty state.
 */
export function BreakdownTable<TRow>({
  page,
  columns,
  renderRow,
  onPageChange,
  emptyTitle = "لا توجد بيانات في الفترة المحددة.",
  rowKey,
}: {
  page: ReportBreakdownPage<TRow>;
  columns: string[];
  renderRow: (row: TRow) => React.ReactNode;
  onPageChange: (page: number) => void;
  emptyTitle?: string;
  rowKey: (row: TRow) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(page.total / page.pageSize));
  if (page.total === 0) {
    return <EmptyState icon={<BarChart3 className="h-8 w-8" strokeWidth={1.5} />} title={emptyTitle} className="m-4 sm:m-[22px]" />;
  }
  return (
    <div>
      <div className="overflow-x-auto">
        {/* Every cell right-aligned: numeric cells carry dir="ltr" for digit shaping, which
            would otherwise make their text-align start = left inside an RTL table (10.15). */}
        <Table className="[&_td]:text-right [&_th]:text-right">
          <TableHeader>
            <TableRow className="bg-stone-50 hover:bg-stone-50">
              {columns.map((c) => (
                <TableHead key={c} className="text-xs font-extrabold text-ink-soft">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.rows.map((row) => (
              <TableRow key={rowKey(row)} className="border-stone-100">
                {renderRow(row)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
        <span className="text-xs text-ink-soft">
          عرض {formatNumberEn((page.page - 1) * page.pageSize + 1)}–{formatNumberEn(Math.min(page.page * page.pageSize, page.total))} من {formatNumberEn(page.total)}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page.page <= 1}
              onClick={() => onPageChange(page.page - 1)}
              aria-label="الصفحة السابقة"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="text-xs text-ink-soft">
              {formatNumberEn(page.page)} / {formatNumberEn(totalPages)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={page.page >= totalPages}
              onClick={() => onPageChange(page.page + 1)}
              aria-label="الصفحة التالية"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
