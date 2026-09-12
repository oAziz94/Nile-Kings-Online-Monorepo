"use client";

/**
 * TanStack Table shell for every partner/admin list (backlog 4.16, standing rule 4:
 * "TanStack Table via the shared `DataTable` shell for every list"). Consumed by
 * 4.18–4.23's partner screens; keep this API small, typed and documented — later tasks
 * only pass `columns`/`data`/the callbacks below, they should never need to reach into
 * TanStack internals directly.
 *
 * Built on `@tanstack/react-table`'s `useLegacyTable` v8-compatibility hook (this repo's
 * installed `^9.2.4` moved sorting/row-model wiring behind an opt-in `features` object;
 * `useLegacyTable` is the documented, still-functional v8-shaped hook — deprecated but not
 * removed — used here to avoid pulling every screen into the larger v9 features API for a
 * shell this small). If a future TanStack major removes it, this file is the one place to
 * migrate, not every call site.
 *
 * Styling matches `docs/redesign/design-canvas/Components.dc.html`'s `table.dt` (white,
 * rounded-xl, stone-200 border, stone-100 header, 12px/800 header text) and
 * `PartnerOrders-Desktop.dc.html`'s sticky `th` background.
 */
import * as React from "react";
import { flexRender } from "@tanstack/react-table/flex-render";
import {
  getCoreRowModel,
  getSortedRowModel,
  useLegacyTable,
  type LegacyColumnDef as ColumnDef,
} from "@tanstack/react-table/legacy";
import type { SortingState } from "@tanstack/table-core";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/shared/skeleton";
import { EmptyState } from "@/components/dashboard/empty-state";

export type { LegacyColumnDef as ColumnDef } from "@tanstack/react-table/legacy";

export type DataTableProps<TData extends Record<string, unknown>> = {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  /** Row click handler (e.g. navigate to a detail page). Omit for non-clickable rows. */
  onRowClick?: (row: TData) => void;
  getRowId?: (row: TData) => string;
  /** Controlled sorting; omit for an unsorted table. */
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  /** Selection column (checkbox) — controlled by the caller, keyed by `getRowId`. */
  selectedIds?: Set<string>;
  onSelectedIdsChange?: (ids: Set<string>) => void;
  /** Extra attributes merged onto each `<tr>` (e.g. `data-row-id` for `useRowScrollRestore`). */
  getRowProps?: (row: TData) => React.HTMLAttributes<HTMLTableRowElement>;
  loading?: boolean;
  loadingRowCount?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: React.ReactNode;
  className?: string;
};

export function DataTable<TData extends Record<string, unknown>>({
  columns,
  data,
  onRowClick,
  getRowId,
  sorting,
  onSortingChange,
  selectedIds,
  onSelectedIdsChange,
  getRowProps,
  loading,
  loadingRowCount = 5,
  emptyTitle = "لا توجد بيانات",
  emptyDescription,
  emptyIcon,
  className,
}: DataTableProps<TData>) {
  const [internalSorting, setInternalSorting] = React.useState<SortingState>([]);
  const activeSorting = sorting ?? internalSorting;

  const selectable = Boolean(selectedIds && onSelectedIdsChange && getRowId);

  const allColumns = React.useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!selectable) return columns;
    const selectionColumn: ColumnDef<TData, unknown> = {
      id: "__select__",
      header: () => (
        <input
          type="checkbox"
          aria-label="تحديد كل الصفوف"
          checked={data.length > 0 && selectedIds!.size === data.length}
          ref={(el) => {
            if (el) {
              el.indeterminate = selectedIds!.size > 0 && selectedIds!.size < data.length;
            }
          }}
          onChange={(e) => {
            if (e.target.checked) {
              onSelectedIdsChange!(new Set(data.map((row) => getRowId!(row))));
            } else {
              onSelectedIdsChange!(new Set());
            }
          }}
          className="h-4 w-4 rounded border-stone-300 accent-lapis-800"
        />
      ),
      cell: ({ row }) => {
        const id = getRowId!(row.original as TData);
        const checked = selectedIds!.has(id);
        return (
          <input
            type="checkbox"
            aria-label="تحديد الصف"
            checked={checked}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const next = new Set(selectedIds);
              if (e.target.checked) next.add(id);
              else next.delete(id);
              onSelectedIdsChange!(next);
            }}
            className="h-4 w-4 rounded border-stone-300 accent-lapis-800"
          />
        );
      },
    };
    return [selectionColumn, ...columns];
  }, [columns, selectable, data, selectedIds, onSelectedIdsChange, getRowId]);

  const table = useLegacyTable({
    data,
    columns: allColumns,
    state: { sorting: activeSorting },
    onSortingChange: (updater) => {
      const next = typeof updater === "function" ? updater(activeSorting) : updater;
      if (onSortingChange) onSortingChange(next);
      else setInternalSorting(next);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (loading) {
    return (
      <div className={cn("overflow-hidden rounded-xl border border-stone-200 bg-white", className)}>
        <div className="space-y-2 p-4">
          {Array.from({ length: loadingRowCount }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon ?? <ChevronsUpDown className="h-8 w-8" strokeWidth={1.5} />}
        title={emptyTitle}
        description={emptyDescription}
        className="rounded-xl border-stone-200 bg-white"
      />
    );
  }

  return (
    <div className={cn("overflow-x-auto rounded-xl border border-stone-200 bg-white", className)}>
      <table className="w-full border-collapse text-right">
        <thead className="sticky top-0 z-10 bg-stone-100">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortDir = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-xs font-extrabold text-ink-soft"
                    aria-sort={
                      sortDir === "asc" ? "ascending" : sortDir === "desc" ? "descending" : "none"
                    }
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-1"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortDir === "asc" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : sortDir === "desc" ? (
                          <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const extraProps = getRowProps?.(row.original as TData);
            return (
            <tr
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original as TData) : undefined}
              {...extraProps}
              className={cn(
                "border-t border-stone-200",
                onRowClick && "cursor-pointer hover:bg-stone-50",
                extraProps?.className
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-3.5 text-sm text-ink">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
