"use client";

/**
 * Notifications v1 UI (backlog 10.35) — wraps `GET /api/notifications`,
 * `GET /api/notifications/unread-count` and `POST /api/notifications/read`. Shared by both
 * dashboards (the routes are session-scoped, see `app/api/notifications/route.ts`).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NotificationKind } from "@/lib/notifications/kinds";

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  href: string;
  entityType: string | null;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationsListResponse = {
  items: NotificationRow[];
  unreadCount: number;
  nextCursor: string | null;
};

type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const json = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!res.ok || !json?.data) {
    throw new Error(json?.error?.message ?? "تعذر تحميل الإشعارات");
  }
  return json.data;
}

/** The bell's 30s poll — hits the lightweight count-only endpoint. `refetchIntervalInBackground`
 * defaults to `false`, so this pauses while the tab is hidden (backlog 10.35's "while the tab is
 * visible"). */
export function useNotificationsUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => fetchJson<{ unreadCount: number }>("/api/notifications/unread-count"),
    refetchInterval: 30_000,
  });
}

/** The popover's latest rows (limit 15, no pagination) or the history page's cursor-paginated
 * list. `cursor` undefined/omitted for the first page. */
export function useNotificationsList(filter: "unread" | "all", limit = 15, enabled = true) {
  return useQuery({
    queryKey: ["notifications", "list", filter, limit],
    queryFn: () =>
      fetchJson<NotificationsListResponse>(`/api/notifications?filter=${filter}&limit=${limit}`),
    // Backlog 10.39 — a list shown on demand (the bell popover) must be fresh every time it is
    // shown; the bell passes `enabled = open` and invalidates on open, so cached data is only
    // a placeholder while the refetch is in flight.
    staleTime: 0,
    enabled,
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { ids: string[] } | { all: true }) => {
      const res = await fetch("/api/notifications/read", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("تعذر تحديث الإشعارات");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
