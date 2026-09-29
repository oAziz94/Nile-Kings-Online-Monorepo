"use client";

/**
 * Notifications v1 UI (backlog 10.35) — wraps `GET /api/notifications`,
 * `GET /api/notifications/unread-count` and `POST /api/notifications/read`. Shared by both
 * dashboards (the routes are session-scoped, see `app/api/notifications/route.ts`).
 */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

/**
 * Backlog 10.40 — every notifications query is "live": never considered fresh, polled every
 * 20 s while the tab is visible, and refetched the moment the tab regains focus. The app-wide
 * QueryClient turns `refetchOnWindowFocus` off, which is why the badge stayed stale when the
 * owner came back to a background tab (polling pauses while hidden and only resumed on the
 * next tick, up to 30 s later).
 */
const LIVE_QUERY = {
  staleTime: 0,
  refetchInterval: 20_000,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
} as const;

/** The bell badge — the lightweight count-only endpoint. */
export function useNotificationsUnreadCount() {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => fetchJson<{ unreadCount: number }>("/api/notifications/unread-count"),
    ...LIVE_QUERY,
  });
}

/** The popover's latest rows (limit 15, no pagination). The bell passes `enabled = open`
 * (backlog 10.39), so the list only exists while the popover is open, and invalidates on open,
 * so it is fetched fresh every time. */
export function useNotificationsList(filter: "unread" | "all", limit = 15, enabled = true) {
  return useQuery({
    queryKey: ["notifications", "list", filter, limit],
    queryFn: () =>
      fetchJson<NotificationsListResponse>(`/api/notifications?filter=${filter}&limit=${limit}`),
    ...LIVE_QUERY,
    enabled,
  });
}

/** Backlog 10.40 — the الإشعارات history page: cursor pages, live like the bell. */
export function useNotificationsHistory(filter: "unread" | "all", limit = 20) {
  return useInfiniteQuery({
    queryKey: ["notifications", "history", filter, limit],
    queryFn: ({ pageParam }) =>
      fetchJson<NotificationsListResponse>(
        `/api/notifications?filter=${filter}&limit=${limit}${pageParam ? `&cursor=${pageParam}` : ""}`
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    ...LIVE_QUERY,
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
