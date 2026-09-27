"use client";

import * as React from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { NotificationRow } from "@/components/dashboard/notification-row";
import { useMarkNotificationsRead, type NotificationRow as NotificationRowData } from "@/hooks/use-notifications";

type ApiEnvelope<T> = { data?: T; error?: { message?: string } };
type ListResponse = { items: NotificationRowData[]; unreadCount: number; nextCursor: string | null };

/**
 * `/admin/notifications` and `/partner/notifications` (backlog 10.35) — same row component as
 * the bell popover, filter unread/all, cursor pagination ("عرض المزيد"), empty state. Plain
 * fetch + local state (not react-query), matching `/admin/audit`'s history-list pattern; the
 * bell is the one place that needs react-query's polling/cache-sharing.
 */
export function NotificationsHistory() {
  const [filter, setFilter] = React.useState<"unread" | "all">("all");
  const [rows, setRows] = React.useState<NotificationRowData[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const markRead = useMarkNotificationsRead();

  const load = React.useCallback((f: "unread" | "all") => {
    setLoading(true);
    fetch(`/api/notifications?filter=${f}&limit=20`, { credentials: "include" })
      .then((r) => r.json())
      .then((json: ApiEnvelope<ListResponse>) => {
        if (json?.data) {
          setRows(json.data.items);
          setNextCursor(json.data.nextCursor);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  React.useEffect(() => {
    load(filter);
  }, [filter, load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/notifications?filter=${filter}&limit=20&cursor=${nextCursor}`, {
        credentials: "include",
      });
      const json = (await res.json()) as ApiEnvelope<ListResponse>;
      if (json?.data) {
        setRows((prev) => [...prev, ...json.data!.items]);
        setNextCursor(json.data.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRowClick = (notification: NotificationRowData) => {
    if (notification.readAt === null) {
      markRead.mutate({ ids: [notification.id] });
      setRows((prev) =>
        prev.map((r) => (r.id === notification.id ? { ...r, readAt: new Date().toISOString() } : r))
      );
    }
  };

  const handleMarkAll = async () => {
    await markRead.mutateAsync({ all: true });
    load(filter);
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
