"use client";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type AdminPaginationBarProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  disabled?: boolean;
  pageSizeOptions?: number[];
  className?: string;
};

export function AdminPaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  disabled,
  pageSizeOptions = [10, 20, 50],
  className,
}: AdminPaginationBarProps) {
  const totalPages = total === 0 ? 1 : Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const from = total === 0 ? 0 : safePage * pageSize + 1;
  const to = Math.min(total, (safePage + 1) * pageSize);

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
        className
      )}
    >
      <p className="text-sm text-muted-foreground">
        {total === 0 ? "لا نتائج" : `عرض ${from}–${to} من ${total}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">عدد الصفوف</span>
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
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || safePage <= 0}
            onClick={() => onPageChange(safePage - 1)}
          >
            السابق
          </Button>
          <span className="px-2 text-sm tabular-nums text-muted-foreground">
            {safePage + 1} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || safePage >= totalPages - 1}
            onClick={() => onPageChange(safePage + 1)}
          >
            التالي
          </Button>
        </div>
      </div>
    </div>
  );
}
