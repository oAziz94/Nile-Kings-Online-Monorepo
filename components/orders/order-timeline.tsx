/**
 * "سجل الطلب" (order audit timeline) + the SLA countdown/overdue banner beneath it
 * (backlog 9.3 a) — extracted verbatim from `app/(partner)/partner/orders/[id]/page.tsx`.
 */
import * as React from "react";
import { Clock } from "lucide-react";
import { PanelCard } from "@/components/dashboard/panel-card";
import { formatDateEn } from "@/lib/format-en-numbers";
import type { OrderSlaResult } from "@/lib/orders/order-sla";
import { ORDER_STATUS_LABELS as STATUS_LABELS } from "@/lib/constants/order-status";
import { cn } from "@/lib/utils";

export type OrderAuditLogEntry = {
  id: string;
  event: string;
  statusFrom: string | null;
  statusTo: string | null;
  createdAt: string;
};

const AUDIT_EVENT_LABELS: Record<string, string> = {
  created: "تم إنشاء الطلب",
  confirmed: "أكّدته أنت",
  cancelled: "تم إلغاء الطلب",
  status_change: "تغيير الحالة",
};

export function describeOrderAuditEntry(entry: OrderAuditLogEntry): string {
  if (entry.event === "status_change" && entry.statusTo) {
    return `${STATUS_LABELS[entry.statusTo] ?? entry.statusTo}`;
  }
  return AUDIT_EVENT_LABELS[entry.event] ?? entry.event;
}

/** An `AdminAuditLog` row for this order, already described (backlog 9.7 (d) — the admin
 * order page fetches `GET /api/admin/audit?entityType=order&entityId=<id>` and passes the
 * enriched rows here; the partner page never passes this, so its timeline is unchanged). */
export type AdminAuditLogEntry = {
  id: string;
  actorName: string;
  sentence: string;
  createdAt: string;
};

type TimelineRow = { id: string; text: string; createdAt: string };

export type OrderTimelineProps = {
  auditLog: OrderAuditLogEntry[];
  /** Additive (9.7 d) — merged in with `auditLog`, sorted by time, actor named. */
  adminAuditLog?: AdminAuditLogEntry[];
  sla?: OrderSlaResult | null;
  /** "مهلة التأكيد" vs "مهلة الشحن" label for the non-overdue banner text — the partner page
   * derives this from `order.status === "CREATED"`; callers pass the same check. */
  awaitingConfirmLabel?: boolean;
};

export function OrderTimeline({ auditLog, adminAuditLog, sla, awaitingConfirmLabel }: OrderTimelineProps) {
  const rows: TimelineRow[] = [
    ...auditLog.map((entry) => ({ id: entry.id, text: describeOrderAuditEntry(entry), createdAt: entry.createdAt })),
    ...(adminAuditLog ?? []).map((entry) => ({
      id: entry.id,
      text: `${entry.actorName} — ${entry.sentence}`,
      createdAt: entry.createdAt,
    })),
  ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <>
      <PanelCard title="سجل الطلب" icon={<Clock className="h-5 w-5 text-lapis-800" />}>
        <ol className="space-y-0">
          {rows.length === 0 && <p className="text-sm text-ink-soft">لا توجد أحداث مسجلة بعد.</p>}
          {rows.map((row, idx) => (
            <li key={row.id} className="flex gap-3 pb-4 last:pb-0">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-malachite-text" />
                {idx < rows.length - 1 && <span className="mt-1 w-0.5 flex-1 bg-stone-100" />}
              </div>
              <div>
                <p className="text-[13px] font-bold text-ink">{row.text}</p>
                <p className="text-xs text-ink-soft">{formatDateEn(row.createdAt, { hour: "numeric", minute: "2-digit" })}</p>
              </div>
            </li>
          ))}
        </ol>
      </PanelCard>

      {sla && sla.applicable && (
        <div
          className={cn(
            "flex items-start gap-2.5 rounded-2xl p-4 text-[12px] leading-relaxed",
            sla.overdue ? "bg-danger-bg text-danger-text" : "bg-gold-50 text-ink"
          )}
        >
          <Clock className="h-[18px] w-[18px] shrink-0" />
          {sla.overdue ? (
            <p><b>متأخر:</b> تجاوز هذا الطلب مهلة {sla.hours} ساعة المحددة في إعداداتك.</p>
          ) : (
            <p>
              <b>{awaitingConfirmLabel ? "مهلة التأكيد" : "مهلة الشحن"}:</b> يتبقى {Math.max(0, Math.ceil(sla.remainingHours))} ساعة قبل أن يُعدّ هذا الطلب متأخرًا وفق إعداداتك ({sla.hours} ساعة).
            </p>
          )}
        </div>
      )}
    </>
  );
}
