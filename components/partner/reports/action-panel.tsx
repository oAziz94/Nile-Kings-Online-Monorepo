import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ReportAction } from "@/lib/analytics/partner-reports";

/**
 * "ما يستحق فعلًا" action panel (backlog 5.6a) — every report's derived action list. An
 * action with `href` links out (e.g. to the stock hub or a filtered pipeline); an action
 * with `exportHref` triggers `onExport` instead (e.g. the reorder CSV); an action with
 * neither is informational only (no link), matching the artboard's third bullet.
 */
export function ActionPanel({ actions, onExport }: { actions: ReportAction[]; onExport?: (key: string) => void }) {
  if (actions.length === 0) {
    return <p className="text-xs text-ink-soft">لا توجد إجراءات مقترحة في هذه الفترة.</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {actions.map((action, i) => (
        <div key={i} className="flex flex-col gap-1 border-t border-stone-100 pt-2.5 first:border-t-0 first:pt-0">
          <p className="text-[13px] font-bold leading-relaxed text-ink">{action.label}</p>
          {action.href && (
            <Link href={action.href} className="inline-flex items-center gap-1 text-xs font-bold text-lapis-800 hover:underline">
              افتح
              <ChevronLeft className="h-3 w-3" />
            </Link>
          )}
          {action.exportHref && onExport && (
            <button
              type="button"
              onClick={() => onExport(action.exportHref!)}
              className="inline-flex items-center gap-1 text-xs font-bold text-lapis-800 hover:underline"
            >
              تصدير
              <ChevronLeft className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
