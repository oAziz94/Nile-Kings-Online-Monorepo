"use client";

import * as React from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { NotificationRow } from "@/components/dashboard/notification-row";
import {
  useMarkNotificationsRead,
  useNotificationsHistory,
  type NotificationRow as NotificationRowData,
} from "@/hooks/use-notifications";

/**
 * `/admin/notifications` and `/partner/notifications` (backlog 10.35) — same row component as
 * the bell popover, filter unread/all, cursor pagination ("عرض المزيد"), empty state.
 * Backlog 10.40: moved from a one-off fetch onto the live react-query hook, so a notification
 * that arrives while this page is open appears without a reload (20 s poll + refetch on tab
 * focus), and read state stays in sync with the bell through the shared ["notifications"] key.
 */
export function NotificationsHistory() {
  const [filter, setFilter] = React.useState<"unread" | "all">("all");
  const history = useNotificationsHistory(filter);
  const markRead = useMarkNotificationsRead();

  const rows = React.useMemo(() => {
    const seen = new Set<string>();
    const out: NotificationRowData[] = [];
    for (const page of history.data?.pages ?? []) {
      for (const item of page.items) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          out.push(item);
        }
      }
    }
    return out;
  }, [history.data]);
  const loading = history.isLoading;
  const loadingMore = history.isFetchingNextPage;
  const nextCursor = history.hasNextPage;

  const loadMore = () => {
    if (history.hasNextPage && !history.isFetchingNextPage) void history.fetchNextPage();
  };

  const handleRowClick = (notification: NotificationRowData) => {
    if (notification.readAt === null) {
      markRead.mutate({ ids: [notification.id] });
    }
  };

  const handleMarkAll = async () => {
    await markRead.mutateAsync({ all: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="الإشعارات"
        description="آخر ما وصلك — طلبات جديدة، إلغاء من شريك، أسئلة عملاء"
        actions={
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={handleMarkAll}>
            تعليم الكل كمقروء
          </Button>
        }
      />

      <div className="overflow-hidden rounded-2xl bg-white shadow-soft">
        <div className="border-b border-stone-100 p-3">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as "unread" | "all")}>
            <TabsList>
              <TabsTrigger value="unread">غير مقروء</TabsTrigger>
              <TabsTrigger value="all">الكل</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {loading ? (
          <p className="p-8 text-center text-sm text-ink-soft">جاري التحميل…</p>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-soft">
            {filter === "unread" ? "لا توجد إشعارات غير مقروءة" : "لا توجد إشعارات بعد"}
          </p>
        ) : (
          <div className="divide-y divide-stone-100 p-2">
            {rows.map((n) => (
              <NotificationRow key={n.id} notification={n} onClick={handleRowClick} />
            ))}
          </div>
        )}

        {nextCursor && !loading && (
          <div className="flex justify-center border-t border-stone-100 p-4">
            <Button type="button" variant="outline" onClick={loadMore} disabled={loadingMore} className="rounded-full">
              {loadingMore ? "جاري التحميل…" : "عرض المزيد"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
