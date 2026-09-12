import { cn } from "@/lib/utils";

/**
 * Rebuilt to `docs/redesign/design-canvas/Components.dc.html`'s `.empty` tile — backlog
 * 4.16. Same prop API as before (icon/title/description/className) so admin call sites
 * keep compiling and rendering unchanged.
 */
export function EmptyState({
  icon,
  title,
  description,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-[14px] border border-stone-200 bg-white py-10 text-center",
        className
      )}
    >
      <div className="text-stone-300">{icon}</div>
      <p className="text-[15px] font-extrabold text-ink">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-ink-soft">{description}</p>}
    </div>
  );
}
