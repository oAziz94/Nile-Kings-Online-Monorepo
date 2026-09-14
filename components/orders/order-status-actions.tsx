/**
 * Order status actions (backlog 9.3 a): the header's print/cancel/next-status buttons, and
 * the "تغيير الحالة يدويًا" manual status menu — extracted verbatim from
 * `app/(partner)/partner/orders/[id]/page.tsx`. Two named exports so callers compose them
 * into the same header/panel layout the partner page used (`OrderHeaderActions` in the
 * `PageHeader`'s `actions`, `ManualStatusMenu` inside the items panel's `belowSaveButton`).
 */
import * as React from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export type OrderHeaderActionsProps = {
  status: string;
  printHref: string;
  /** Omit to hide the cancel button entirely (e.g. admin uses its own reason dialog trigger). */
  onCancel?: () => void;
  cancelling?: boolean;
  cancelLabel?: string;
  next?: { value: string; label: string } | null;
  onAdvance?: (nextStatus: string) => void;
  updating?: boolean;
};

export function OrderHeaderActions({
  status,
  printHref,
  onCancel,
  cancelling,
  cancelLabel = "إلغاء الطلب",
  next,
  onAdvance,
  updating,
}: OrderHeaderActionsProps) {
  const canCancel = status !== "CANCELLED" && status !== "DELIVERED";
  // No wrapping element here — the partner page's original markup had exactly one
  // "flex flex-wrap items-center gap-2" div holding the back link AND these buttons as
  // flat siblings; the caller supplies that div (it also holds the back link, which this
  // component doesn't know about), so this returns a fragment to keep that DOM identical
  // instead of nesting a second div inside it.
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="rounded-full"
        aria-label="طباعة"
        onClick={() => window.open(printHref, "_blank", "noopener")}
      >
        <Printer className="h-4 w-4" />
      </Button>
      {onCancel && canCancel && (
        <Button type="button" variant="outline" className="rounded-full" disabled={cancelling} onClick={onCancel}>
          {cancelLabel}
        </Button>
      )}
      {next && (
        <Button type="button" className="rounded-full" disabled={updating} onClick={() => onAdvance?.(next.value)}>
          {updating ? "جاري…" : next.label}
        </Button>
      )}
    </>
  );
}

export type ManualStatusMenuProps = {
  currentStatus: string;
  value: string;
  onChange: (value: string) => void;
  statuses: readonly string[];
  statusLabels: Record<string, string>;
  onApply: () => void;
  updating: boolean;
};

export function ManualStatusMenu({
  currentStatus,
  value,
  onChange,
  statuses,
  statusLabels,
  onApply,
  updating,
}: ManualStatusMenuProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mt-5 border-t border-stone-100 pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-bold text-lapis-800 underline underline-offset-2"
      >
        {open ? "إخفاء تغيير الحالة يدويًا" : "تغيير الحالة يدويًا"}
      </button>
      {open && (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="grid gap-2">
            <Label>الحالة</Label>
            <Select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg sm:w-48">
              {statuses.map((s) => (
                <option key={s} value={s}>{statusLabels[s]}</option>
              ))}
            </Select>
          </div>
          <Button onClick={onApply} disabled={updating || value === currentStatus} className="rounded-full">
            {updating ? "جاري…" : "تحديث الحالة"}
          </Button>
        </div>
      )}
    </div>
  );
}
