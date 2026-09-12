import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Rebuilt to `docs/redesign/design-canvas/PartnerOrders-Desktop.dc.html`'s `.page-head`
 * (23px/800 Cairo title, muted 13px description) — backlog 4.16. Shared with the
 * not-yet-rebuilt admin surface: same prop API as before (title/description/badge/meta/
 * actions/className), only the visual classes changed, so every admin call site keeps
 * compiling and rendering unchanged (verified via `tsc --noEmit` + admin screenshots).
 */
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
    <div className={cn("pb-5", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-extrabold tracking-tight text-ink sm:text-[23px]">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="mt-1 max-w-2xl text-[13px] text-ink-soft">{description}</p>
          )}
          {meta && <div className="mt-2 text-xs text-ink-soft">{meta}</div>}
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
    <Badge variant={variant} className="gap-1 rounded-full font-normal">
      {children}
    </Badge>
  );
}
