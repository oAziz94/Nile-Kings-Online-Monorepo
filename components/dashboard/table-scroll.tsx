import { cn } from "@/lib/utils";

/** Horizontal scroll wrapper for wide admin tables on small screens. */
export function TableScroll({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0",
        "rounded-xl border border-border/60",
        className
      )}
    >
      {children}
    </div>
  );
}
