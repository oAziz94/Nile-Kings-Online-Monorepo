import { cn } from "@/lib/utils";

interface SectionTitleProps {
  title: string;
  subtitle?: string;
  className?: string;
  /** Centered title with decorative horizontal lines on both sides (e.g. for collection sections). */
  variant?: "default" | "withSideLines";
}

export function SectionTitle({ title, subtitle, className, variant = "default" }: SectionTitleProps) {
  if (variant === "withSideLines") {
    return (
      <div className={cn("mb-6 flex items-center justify-center gap-4 px-4", className)}>
        <span className="h-0.5 max-w-12 flex-1 bg-foreground/40" aria-hidden />
        <h2 className="text-2xl font-semibold text-foreground md:text-3xl" dir="rtl">
          {title}
        </h2>
        <span className="h-0.5 max-w-12 flex-1 bg-foreground/40" aria-hidden />
        {subtitle != null && (
          <p className="sr-only">{subtitle}</p>
        )}
      </div>
    );
  }
  return (
    <div className={cn("mb-4 text-center", className)}>
      <h2 className="mb-2 text-3xl font-semibold text-foreground md:text-4xl">
        {title}
      </h2>
      <div className="mx-auto h-0.5 w-[60px] bg-burgundy" aria-hidden />
      {subtitle && (
        <p className="mt-2 text-muted-foreground">{subtitle}</p>
      )}
    </div>
  );
}
