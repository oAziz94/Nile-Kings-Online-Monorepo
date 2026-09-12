import { cn } from "@/lib/utils";

/**
 * Rebuilt to `docs/redesign/design-canvas/Components.dc.html`'s `.panel`/`.panel-head`
 * (white, radius 14, 1px stone-200 border) — backlog 4.16. Same prop API as before
 * (title/description/icon/toolbar/children/className/contentClassName/noPadding); admin
 * call sites keep compiling and rendering unchanged, they just pick up the new look.
 */
export function PanelCard({
  title,
  description,
  icon,
  toolbar,
  children,
  className,
  contentClassName,
  noPadding,
}: {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  noPadding?: boolean;
}) {
  return (
    <div className={cn("overflow-hidden rounded-[14px] border border-stone-200 bg-white", className)}>
      <div
        className={cn(
          "gap-4 border-b border-stone-200 px-4 py-4 sm:px-[22px]",
          toolbar ? "flex flex-col sm:flex-row sm:items-center sm:justify-between" : undefined
        )}
      >
        <div>
          <h2 className="flex items-center gap-2 text-base font-extrabold text-ink">
            {icon}
            {title}
          </h2>
          {description && <p className="mt-1 text-[13px] text-ink-soft">{description}</p>}
        </div>
        {toolbar}
      </div>
      <div className={cn(!noPadding && "p-4 sm:p-[22px]", noPadding && "p-0", contentClassName)}>
        {children}
      </div>
    </div>
  );
}
