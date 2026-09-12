import { cn } from "@/lib/utils";

interface SectionTitleProps {
  title: string;
  subtitle?: string;
  className?: string;
  /** Centered title with decorative horizontal lines on both sides (e.g. for collection sections). */
  variant?: "default" | "withSideLines" | "large";
}

/**
 * Section heading — backlog 4.6 shared primitive: Amiri display type, 34–38px, gold rule instead
 * of the pre-redesign burgundy one. `withSideLines`/`large` variants kept (existing call sites
 * still use them until their own screen tasks — 4.7–4.10 — rebuild those page bodies).
 */
export function SectionTitle({ title, subtitle, className, variant = "default" }: SectionTitleProps) {
  if (variant === "withSideLines") {
    return (
      <div className={cn("mb-6 flex items-center justify-center gap-4 px-4", className)}>
        <span className="h-px max-w-12 flex-1 bg-[hsl(228_16%_80%)]" aria-hidden />
        <h2 className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)] md:text-3xl" dir="rtl">
          {title}
        </h2>
        <span className="h-px max-w-12 flex-1 bg-[hsl(228_16%_80%)]" aria-hidden />
        {subtitle != null && (
          <p className="sr-only">{subtitle}</p>
        )}
      </div>
    );
  }
  if (variant === "large") {
    return (
      <div className={cn("mb-8 text-center", className)}>
        <h2 className="mb-3 font-amiri text-4xl font-bold text-[hsl(228_40%_14%)] md:text-5xl">
          {title}
        </h2>
        <div className="mx-auto h-0.5 w-20 bg-gold-500" aria-hidden />
        {subtitle && (
          <p className="mt-3 text-lg text-[hsl(228_18%_40%)] md:text-xl">{subtitle}</p>
        )}
      </div>
    );
  }
  return (
    <div className={cn("mb-4 text-center", className)}>
      <h2 className="mb-2 font-amiri text-3xl font-bold text-[hsl(228_40%_14%)] md:text-4xl">
        {title}
      </h2>
      <div className="mx-auto h-0.5 w-[60px] bg-gold-500" aria-hidden />
      {subtitle && (
        <p className="mt-2 text-[hsl(228_18%_40%)]">{subtitle}</p>
      )}
    </div>
  );
}
