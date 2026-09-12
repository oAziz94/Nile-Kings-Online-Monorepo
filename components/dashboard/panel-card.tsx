import { cn } from "@/lib/utils";

/**
 * Rebuilt to `design-canvas/partner-v2/build.mjs`'s `.card`/`.card-h` (white, radius 16,
 * soft shadow `0 1px 2px rgba(20,24,40,.04), 0 10px 28px -14px rgba(20,24,40,.12)`, no
 * border) — backlog 5.1. Same prop API as before
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
    <div className={cn("overflow-hidden rounded-2xl bg-white shadow-soft", className)}>
      <div
        className={cn(
          "gap-4 border-b border-stone-100 px-4 py-4 sm:px-5",
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
