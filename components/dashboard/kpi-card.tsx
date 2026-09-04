import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/shared/skeleton";
import { cn } from "@/lib/utils";

export type KpiAccent = "burgundy" | "gold" | "emerald" | "slate";

const accentStyles: Record<KpiAccent, string> = {
  burgundy: "bg-burgundy/10 text-burgundy ring-burgundy/20",
  gold: "bg-gold/15 text-amber-800 ring-gold/25",
  emerald: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  slate: "bg-muted text-muted-foreground ring-border",
};

export function KpiCard({
  title,
  value,
  hint,
  icon,
  accent = "burgundy",
  loading,
  footer,
  className,
}: {
  title: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  accent?: KpiAccent;
  loading?: boolean;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-lg border-border shadow-card",
        className
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="mt-3 h-8 w-32" />
            ) : (
              <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">{value}</p>
            )}
            {hint && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p>
            )}
            {footer}
          </div>
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1 ring-inset",
              accentStyles[accent]
            )}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
