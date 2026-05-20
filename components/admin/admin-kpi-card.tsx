import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/shared/skeleton";
import { cn } from "@/lib/utils";

export type AdminKpiAccent = "burgundy" | "gold" | "emerald" | "slate";

const accentStyles: Record<AdminKpiAccent, string> = {
  burgundy: "bg-burgundy/10 text-burgundy ring-burgundy/20",
  gold: "bg-gold/15 text-amber-800 ring-gold/25",
  emerald: "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20",
  slate: "bg-muted text-muted-foreground ring-border",
};

export function AdminKpiCard({
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
  accent?: AdminKpiAccent;
  loading?: boolean;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "overflow-hidden rounded-2xl border-border/80 shadow-card transition-shadow hover:shadow-md",
        className
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="mt-3 h-9 w-32" />
            ) : (
              <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">{value}</p>
            )}
            {hint && (
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p>
            )}
            {footer}
          </div>
          <div
            className={cn(
              "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset",
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
