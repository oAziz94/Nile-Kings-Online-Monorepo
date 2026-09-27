"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { useEdgeScrollFade } from "@/hooks/use-edge-scroll-fade";

/**
 * Backlog 10.33: on phones this wrapper is the horizontal scroller for every dashboard
 * table built from these primitives (partner/admin only — never used on the storefront).
 * Root cause measured at 390 wide: the `<table>` had no `min-w`, so its columns squeezed to
 * fit `w-full` instead of the wrapper ever needing to scroll — `overflow-auto` alone was a
 * no-op. `min-w-max` keeps every column at its natural (content) width; the wrapper scrolls
 * with touch tuned (`overscroll-behavior-x: contain` stops the swipe from bubbling into the
 * page's own scroll), and an inline-end edge fade (via `useEdgeScrollFade`) shows only while
 * more columns are hidden. The first column of every row is sticky with `bg-inherit` — not
 * its own hardcoded color — so it always matches whatever the row itself is painted with
 * (base `bg-white` on `TableRow`, `hover:bg-stone-50` on hover, `data-[state=selected]:bg-muted`
 * when selected, or a caller's own row-tint override) and stays opaque over the columns
 * passing underneath while swiping. This depends on `TableRow`'s background always being an
 * opaque color (never a `/alpha` one) — a translucent row background would compute to the
 * same translucent value on the sticky cell via `inherit`, which is fine when the row isn't
 * scrolled, but would let scrolled-past columns show through the sticky cell's tint. Backlog
 * 10.33 rework: hover used to be `hover:bg-muted/50` (translucent) with the sticky cell's own
 * separate opaque `bg-white`, which matched at rest but visibly seamed on hover (row tinted,
 * sticky cell didn't) — fixed by making the row's own background carry the real state and
 * having the sticky cell mirror it exactly, instead of asserting its own competing color.
 */
const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => {
  const { ref: scrollRef, hasMoreEnd } = useEdgeScrollFade<HTMLDivElement>();
  return (
    <div className="relative w-full">
      <div
        ref={scrollRef}
        className="w-full overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]"
      >
        <table
          ref={ref}
          className={cn(
            "w-full min-w-max caption-bottom text-sm",
            "[&_tr>*:first-child]:sticky [&_tr>*:first-child]:start-0 [&_tr>*:first-child]:z-[1] [&_tr>*:first-child]:bg-inherit",
            className
          )}
          {...props}
        />
      </div>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 end-0 w-8 bg-gradient-to-l from-white to-transparent transition-opacity rtl:bg-gradient-to-r",
          hasMoreEnd ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
});
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
));
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
));
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      // `bg-white` is an explicit, opaque base (not the previous transparent default) —
      // the sticky first-column cell (10.33) inherits this via `bg-inherit`, so it must
      // always be a real, opaque color for that inheritance to look right and stay opaque
      // over scrolled content. Hover is `bg-stone-50` (opaque), not the old `bg-muted/50`
      // (translucent) — a translucent hover tint would have inherited into the sticky cell
      // as the same translucent value, which is fine at rest but wrong while mid-scroll.
      "border-b border-border bg-white transition-colors hover:bg-stone-50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      "h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
      className
    )}
    {...props}
  />
));
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
    {...props}
  />
));
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
));
TableCaption.displayName = "TableCaption";

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
