"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/shared/skeleton";
import { NotificationRow } from "@/components/dashboard/notification-row";
import {
  useMarkNotificationsRead,
  useNotificationsList,
  useNotificationsUnreadCount,
  type NotificationRow as NotificationRowData,
  type NotificationsListResponse,
} from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

function NotificationsBody({
  isLoading,
  isError,
  data,
  onRowClick,
  emptyLabel,
}: {
  isLoading: boolean;
  isError: boolean;
  data: NotificationsListResponse | undefined;
  onRowClick: (n: NotificationRowData) => void;
  emptyLabel: string;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2 p-1">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    );
  }
  if (isError || !data) {
    return <p className="p-4 text-center text-sm text-ink-soft">تعذر تحميل الإشعارات</p>;
  }
  if (data.items.length === 0) {
    return <p className="p-4 text-center text-sm text-ink-soft">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-0.5">
      {data.items.map((n) => (
        <NotificationRow key={n.id} notification={n} onClick={onRowClick} dense />
      ))}
    </div>
  );
}

/**
 * Shared topbar bell (backlog 10.35) — replaces `AdminQueueBell` and `PartnerAlertsBell`.
 * Badge = unread count (react-query polling every 30s while the tab is visible, see
 * `useNotificationsUnreadCount`), popover with غير مقروء / الكل tabs (latest 15 rows each),
 * click a row → marks it read then navigates to its `href` (the `Link` itself does the
 * navigation; the mark-read call is fired alongside, not awaited, so it never delays it).
 * `historyHref` is `/admin/notifications` or `/partner/notifications` per surface.
 */
export function NotificationsBell({ historyHref, className }: { historyHref: string; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<"unread" | "all">("unread");
  const { data: countData } = useNotificationsUnreadCount();
  const unreadCount = countData?.unreadCount ?? 0;

  const unreadQuery = useNotificationsList("unread", 15);
  const allQuery = useNotificationsList("all", 15);
  const markRead = useMarkNotificationsRead();

  const handleRowClick = (notification: NotificationRowData) => {
    if (notification.readAt === null) {
      markRead.mutate({ ids: [notification.id] });
    }
    setOpen(false);
  };

  const handleMarkAll = () => {
    markRead.mutate({ all: true });
  };

  const badgeLabel =
    unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unreadCount > 0 ? `الإشعارات (${unreadCount > 99 ? "أكثر من 99" : unreadCount} غير مقروء)` : "الإشعارات"}
          className={cn(
            "relative flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-ink transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
            className
          )}
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={2} />
          {unreadCount > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-1 -left-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-carnelian-500 px-1 text-[10px] font-extrabold leading-none text-white"
            >
              {badgeLabel}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0" dir="rtl">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "unread" | "all")}>
          <div className="flex items-center justify-between border-b border-stone-200 px-3 pt-3">
            <TabsList>
              <TabsTrigger value="unread">غير مقروء</TabsTrigger>
              <TabsTrigger value="all">الكل</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="unread" className="m-0 max-h-[360px] overflow-y-auto p-2">
            <NotificationsBody
              isLoading={unreadQuery.isLoading}
              isError={unreadQuery.isError}
              data={unreadQuery.data}
              onRowClick={handleRowClick}
              emptyLabel="لا توجد إشعارات غير مقروءة"
            />
          </TabsContent>
          <TabsContent value="all" className="m-0 max-h-[360px] overflow-y-auto p-2">
            <NotificationsBody
              isLoading={allQuery.isLoading}
              isError={allQuery.isError}
              data={allQuery.data}
              onRowClick={handleRowClick}
              emptyLabel="لا توجد إشعارات"
            />
          </TabsContent>
        </Tabs>

        <div className="flex items-center justify-between border-t border-stone-200 px-3 py-2.5">
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={unreadCount === 0 || markRead.isPending}
            className="text-xs font-bold text-lapis-800 underline underline-offset-2 disabled:cursor-not-allowed disabled:text-ink-soft disabled:no-underline"
          >
            تعليم الكل كمقروء
          </button>
          <Link
            href={historyHref}
            onClick={() => setOpen(false)}
            className="text-xs font-bold text-ink-soft underline underline-offset-2 hover:text-ink"
          >
            كل الإشعارات
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
