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
 * more columns are hidden. The first column of every row is sticky with its own opaque
 * `bg-white` (dashboard tables all sit on a white card) so it stays opaque over the columns
 * passing underneath while swiping.
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
            "[&_tr>*:first-child]:sticky [&_tr>*:first-child]:start-0 [&_tr>*:first-child]:z-[1] [&_tr>*:first-child]:bg-white",
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
      "border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
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
