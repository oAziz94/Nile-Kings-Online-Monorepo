"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Bell, PackageX, RefreshCw, ShoppingCart, Truck } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/shared/skeleton";
import { usePartnerAlerts, useMarkPartnerAlertsSeen, type PartnerAlert, type PartnerAlertKind } from "@/hooks/use-partner-alerts";
import { formatDateEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

/**
 * Topbar bell (backlog 4.17) — fills the two inert "قريبًا" bell buttons `PartnerShell`
 * (4.16) left in place. `Popover` (`components/ui/popover.tsx`) listing computed alerts
 * grouped by kind + "تعليم الكل كمقروء"; opening the popover marks everything seen
 * (`POST /api/partner/alerts/seen`), matching the backlog text exactly.
 */

const KIND_LABEL: Record<PartnerAlertKind, string> = {
  new_order: "طلبات جديدة",
  low_stock: "مخزون منخفض",
  restock: "إعادة توريد",
  overdue: "طلبات متأخرة",
};

const KIND_ORDER: PartnerAlertKind[] = ["overdue", "new_order", "low_stock", "restock"];

const KIND_ICON: Record<PartnerAlertKind, React.ComponentType<{ className?: string }>> = {
  new_order: ShoppingCart,
  low_stock: PackageX,
  restock: Truck,
  overdue: AlertTriangle,
};

function groupAlerts(alerts: PartnerAlert[]): { kind: PartnerAlertKind; items: PartnerAlert[] }[] {
  return KIND_ORDER.map((kind) => ({ kind, items: alerts.filter((a) => a.kind === kind) })).filter(
    (group) => group.items.length > 0
  );
}

export function PartnerAlertsBell({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  const { data, isLoading, isError, refetch, isFetching } = usePartnerAlerts();
  const markSeen = useMarkPartnerAlertsSeen();

  const unseenCount = data?.unseenCount ?? 0;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && unseenCount > 0) {
      markSeen.mutate();
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unseenCount > 0 ? `الإشعارات (${unseenCount} غير مقروء)` : "الإشعارات"}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-[10px] bg-stone-100 text-ink-soft transition-colors hover:bg-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
            className
          )}
        >
          <Bell className="h-4 w-4" strokeWidth={1.6} />
          {unseenCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -left-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-carnelian-500 px-1 text-[10px] font-extrabold leading-none text-white"
            >
              {unseenCount > 9 ? "9+" : unseenCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-0" dir="rtl">
        <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
          <p className="text-sm font-extrabold text-ink">الإشعارات</p>
          <button
            type="button"
            onClick={() => markSeen.mutate()}
            disabled={!data || data.alerts.length === 0}
            className="text-xs font-bold text-lapis-800 underline underline-offset-2 disabled:cursor-not-allowed disabled:text-ink-soft disabled:no-underline"
          >
            تعليم الكل كمقروء
          </button>
        </div>

        <div className="max-h-[360px] overflow-y-auto p-2">
          {isLoading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ) : isError ? (
            <div role="alert" className="m-2 rounded-lg border border-carnelian-500/30 bg-danger-bg p-3 text-danger-text">
              <p className="flex items-center gap-2 text-sm font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                تعذر تحميل التنبيهات
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-2 flex items-center gap-1 text-xs font-bold underline underline-offset-2"
              >
                <RefreshCw className={cn("h-3 w-3", isFetching && "animate-spin")} />
                إعادة المحاولة
              </button>
            </div>
          ) : !data || data.alerts.length === 0 ? (
            <p className="p-4 text-center text-sm text-ink-soft">لا توجد تنبيهات جديدة</p>
          ) : (
            <div className="space-y-3">
              {groupAlerts(data.alerts).map((group) => {
                const Icon = KIND_ICON[group.kind];
                return (
                  <div key={group.kind}>
                    <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft">
                      {KIND_LABEL[group.kind]}
                    </p>
                    <ul className="space-y-1">
                      {group.items.map((alert) => (
                        <li key={alert.id}>
                          <Link
                            href={alert.href}
                            onClick={() => setOpen(false)}
                            className="flex items-start gap-2 rounded-lg px-2 py-2 text-sm text-ink transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
                          >
                            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{alert.message}</span>
                              <span dir="ltr" className="block text-right text-[11px] text-ink-soft">
                                {formatDateEn(alert.occurredAt, { hour: "numeric", minute: "2-digit" })}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
