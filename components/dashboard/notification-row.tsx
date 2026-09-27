"use client";

import Link from "next/link";
import { AlertTriangle, Bell, MessageCircleQuestion, PackageCheck, ShoppingCart } from "lucide-react";
import { NOTIFICATION_KIND_ICON, type NotificationKind } from "@/lib/notifications/kinds";
import { formatRelativeTimeAr } from "@/lib/format-relative-time-ar";
import { cn } from "@/lib/utils";
import type { NotificationRow as NotificationRowData } from "@/hooks/use-notifications";

/**
 * One notification row (backlog 10.35) — shared by the bell popover and the `/admin|partner
 * /notifications` history pages. `lib/notifications/kinds.ts` names the icon as a string (kept
 * server-safe there); this is the one place that resolves it to a real lucide component.
 */
const ICONS = {
  ShoppingCart,
  PackageCheck,
  AlertTriangle,
  MessageCircleQuestion,
} satisfies Record<string, typeof Bell>;

function iconFor(kind: NotificationKind) {
  const name = NOTIFICATION_KIND_ICON[kind];
  return ICONS[name as keyof typeof ICONS] ?? Bell;
}

export function NotificationRow({
  notification,
  onClick,
  dense = false,
}: {
  notification: NotificationRowData;
  onClick?: (notification: NotificationRowData) => void;
  dense?: boolean;
}) {
  const Icon = iconFor(notification.kind);
  const unread = notification.readAt === null;

  return (
    <Link
      href={notification.href}
      onClick={() => onClick?.(notification)}
      className={cn(
        "flex items-start gap-3 rounded-lg px-3 py-2.5 text-right transition-colors hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
        unread && "bg-lapis-50/50"
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          unread ? "bg-lapis-800 text-gold-500" : "bg-stone-100 text-ink-soft"
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm", unread ? "font-extrabold text-ink" : "font-semibold text-ink")}>
          {notification.title}
        </span>
        {notification.body && (
          <span className={cn("mt-0.5 block text-xs text-ink-soft", dense && "line-clamp-2")}>
            {notification.body}
          </span>
        )}
        <span className="mt-1 block text-[11px] text-ink-soft">
          {formatRelativeTimeAr(notification.createdAt)}
        </span>
      </span>
      {unread && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-carnelian-500" />}
    </Link>
  );
}
