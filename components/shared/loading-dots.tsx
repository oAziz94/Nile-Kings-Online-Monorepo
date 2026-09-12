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
        className={cn("h-2 w-2 rounded-full bg-[hsl(228_40%_14%)] animate-loading-dots motion-reduce:animate-none", dotClassName)}
        style={{ animationDelay: "0s" }}
      />
      <span
        className={cn("h-2 w-2 rounded-full bg-[hsl(228_40%_14%)] animate-loading-dots motion-reduce:animate-none", dotClassName)}
        style={{ animationDelay: "0.2s" }}
      />
      <span
        className={cn("h-2 w-2 rounded-full bg-[hsl(228_40%_14%)] animate-loading-dots motion-reduce:animate-none", dotClassName)}
        style={{ animationDelay: "0.4s" }}
      />
    </div>
  );
}
