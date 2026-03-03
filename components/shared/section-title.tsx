import { cn } from "@/lib/utils";

interface SectionTitleProps {
  title: string;
  subtitle?: string;
  className?: string;
}

export function SectionTitle({ title, subtitle, className }: SectionTitleProps) {
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
