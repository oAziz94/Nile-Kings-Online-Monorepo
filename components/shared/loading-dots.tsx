import { cn } from "@/lib/utils";

export function LoadingDots({
  className,
  dotClassName,
}: {
  className?: string;
  dotClassName?: string;
}) {
  return (
    <div
      className={cn("flex items-center justify-center gap-1.5", className)}
      role="status"
      aria-label="جاري التحميل"
    >
      <span
        className={cn("h-2 w-2 rounded-full bg-primary animate-loading-dots", dotClassName)}
        style={{ animationDelay: "0s" }}
      />
      <span
        className={cn("h-2 w-2 rounded-full bg-primary animate-loading-dots", dotClassName)}
        style={{ animationDelay: "0.2s" }}
      />
      <span
        className={cn("h-2 w-2 rounded-full bg-primary animate-loading-dots", dotClassName)}
        style={{ animationDelay: "0.4s" }}
      />
    </div>
  );
}
