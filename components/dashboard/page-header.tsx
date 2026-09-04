import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  badge,
  meta,
  actions,
  className,
}: {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-b border-border pb-4",
        className
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-foreground sm:text-2xl">{title}</h1>
            {badge}
          </div>
          {description && (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
          {meta && <div className="mt-2 text-xs text-muted-foreground">{meta}</div>}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>
    </div>
  );
}

export function StatusBadge({
  children,
  variant = "success",
}: {
  children: React.ReactNode;
  variant?: "success" | "secondary";
}) {
  return (
    <Badge variant={variant} className="gap-1 rounded-md font-normal">
      {children}
    </Badge>
  );
}
