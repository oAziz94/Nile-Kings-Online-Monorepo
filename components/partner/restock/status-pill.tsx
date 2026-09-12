import { cn } from "@/lib/utils";
import type { RestockRequestStatus } from "./types";

/**
 * Status pill map (backlog 4.20's "shared view model") — the 5-state colouring both
 * restock screens already agree on (`00-feature-inventory/partner/restock-requests.md` +
 * `distributor-requests.md`: FULFILLED/APPROVED→default-ish, REJECTED/CANCELLED→destructive,
 * PENDING→secondary), re-expressed with the design-system's dotted status pills
 * (`docs/redesign/design-canvas/Components.dc.html` `.pill` — neutral/info/warning/
 * success/danger, "carnelian for cancelled").
 */
export const RESTOCK_STATUS_LABELS: Record<RestockRequestStatus, string> = {
  PENDING: "قيد المراجعة",
  APPROVED: "مقبول",
  REJECTED: "مرفوض",
  FULFILLED: "تم التنفيذ",
  CANCELLED: "ملغي",
};

const PILL_CLASSES: Record<RestockRequestStatus, string> = {
  PENDING: "bg-warn-bg text-warn-text",
  APPROVED: "bg-info-bg text-info-text",
  FULFILLED: "bg-malachite-bg text-malachite-text",
  REJECTED: "bg-danger-bg text-danger-text",
  CANCELLED: "bg-danger-bg text-danger-text",
};

export function RestockStatusPill({
  status,
  className,
}: {
  status: RestockRequestStatus | string;
  className?: string;
}) {
  const known = (status as RestockRequestStatus) in RESTOCK_STATUS_LABELS;
  const label = known ? RESTOCK_STATUS_LABELS[status as RestockRequestStatus] : status;
  const pillClass = known ? PILL_CLASSES[status as RestockRequestStatus] : "bg-neutral-bg text-neutral-text";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold",
        pillClass,
        className
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}
