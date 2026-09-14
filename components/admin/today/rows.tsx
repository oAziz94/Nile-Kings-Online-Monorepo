import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { formatRelativeTimeAr } from "@/lib/format-relative-time-ar";
import { piastresToEgp } from "@/lib/catalog";
import { ORDER_STATUS_LABELS } from "@/lib/constants/order-status";
import type {
  DueBalanceRow,
  LowStockQueueRow,
  OverdueOrderRow,
  PartnerRequestRow,
  TicketQueueRow,
  UnassignedOrderRow,
} from "@/lib/admin/today";

/** One اليوم queue row's shared shape: primary text · secondary muted text · one action. */
function RowLayout({
  primary,
  secondary,
  action,
}: {
  primary: React.ReactNode;
  secondary: React.ReactNode;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:flex-nowrap">
      <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{primary}</span>
      <span className="shrink-0 text-xs text-ink-soft">{secondary}</span>
      {action}
    </div>
  );
}

function ActionButton({ href, label, primary }: { href: string; label: string; primary?: boolean }) {
  return (
    <Button
      asChild
      size="sm"
      variant={primary ? "default" : "outline"}
      className="h-7 shrink-0 rounded-full px-3 text-[11px]"
    >
      <Link href={href}>{label}</Link>
    </Button>
  );
}

export function UnassignedOrderQueueRow({ row }: { row: UnassignedOrderRow }) {
  return (
    <RowLayout
      primary={
        <span dir="auto">
          <span dir="ltr">#{row.id.slice(-6)}</span> · {row.customerName} · {row.governorate}
        </span>
      }
      secondary={formatRelativeTimeAr(row.createdAt)}
      action={<ActionButton href={`/admin/orders/${row.id}`} label="إسناد" primary />}
    />
  );
}

export function OverdueOrderQueueRow({ row }: { row: OverdueOrderRow }) {
  const statusLabel = ORDER_STATUS_LABELS[row.status] ?? row.status;
  return (
    <RowLayout
      primary={
        <span dir="auto">
          <span dir="ltr">#{row.id.slice(-6)}</span> · {row.partnerName} · {statusLabel}
        </span>
      }
      secondary={
        <span>
          تجاوز المهلة بـ <span dir="ltr">{formatNumberEn(row.overdueHours)}</span> ساعة
        </span>
      }
      action={<ActionButton href={`/admin/orders/${row.id}`} label="فتح" />}
    />
  );
}

export function TicketQueueRowView({ row }: { row: TicketQueueRow }) {
  return (
    <RowLayout
      primary={
        <span dir="auto">
          {row.subjectLabel} · <span dir="ltr">#{row.orderId.slice(-6)}</span>
        </span>
      }
      secondary={formatRelativeTimeAr(row.createdAt)}
      action={<ActionButton href={`/admin/order-tickets/${row.id}`} label="رد" primary />}
    />
  );
}

export function PartnerRequestQueueRow({ row }: { row: PartnerRequestRow }) {
  return (
    <RowLayout
      primary={`${row.name} · ${row.requestTypeLabel} · ${row.governorate}`}
      secondary={formatRelativeTimeAr(row.createdAt)}
      action={<ActionButton href="/admin/partners" label="مراجعة" />}
    />
  );
}

export function LowStockQueueRowView({ row }: { row: LowStockQueueRow }) {
  return (
    <RowLayout
      primary={
        <span dir="auto">
          <span dir="ltr">{row.sku}</span> · {row.variantLabel} · {row.partnerName}
        </span>
      }
      secondary={
        <span dir="auto">
          <span dir="ltr">{formatNumberEn(row.sellable)}</span> قابل للبيع · الحد{" "}
          <span dir="ltr">{formatNumberEn(row.threshold)}</span>
        </span>
      }
      action={<ActionButton href={`/admin/partners?tab=network&partner=${row.partnerId}`} label="فتح" />}
    />
  );
}

export function DueBalanceQueueRow({ row }: { row: DueBalanceRow }) {
  const dueLabel = row.overdue
    ? `استحق منذ ${formatNumberEn(Math.abs(row.daysFromNow))} يومًا`
    : row.daysFromNow === 0
      ? "يستحق اليوم"
      : `يستحق خلال ${formatNumberEn(row.daysFromNow)} يومًا`;
  return (
    <RowLayout
      primary={
        <span dir="auto">
          {row.partnerName} · {row.kindLabel} <span dir="ltr">{formatNumberEn(piastresToEgp(row.amountPiastres))}</span> ج.م
        </span>
      }
      secondary={dueLabel}
      action={<ActionButton href="/admin/partners" label="تسجيل دفعة" />}
    />
  );
}
