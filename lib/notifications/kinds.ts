/**
 * Notifications v1 (backlog 10.34) — the four kinds that exist, one Arabic label and one
 * lucide icon name per kind. This is the single source of truth `notify()` (`./notify.ts`)
 * and the write points import their `kind` string from, and the UI task (10.35) reads this
 * map for the bell/history row icon — no other kind exists yet (the larger catalogue in
 * `docs/redesign/09-notifications-plan.md` is a later phase, not built).
 */

export const NOTIFICATION_KINDS = [
  "order.created",
  "order.assigned",
  "order.cancelled_by_partner",
  "ticket.created",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

/** Arabic label per kind, for the settings/history filters (10.35). */
export const NOTIFICATION_KIND_LABEL: Record<NotificationKind, string> = {
  "order.created": "طلب جديد",
  "order.assigned": "طلب مُسنَد",
  "order.cancelled_by_partner": "إلغاء من الشريك",
  "ticket.created": "سؤال جديد",
};

/** lucide-react icon export name per kind — the UI task (10.35) maps this string to the
 * actual component; kept as a string here so this module stays server-safe (no "use client"
 * / no component imports). */
export const NOTIFICATION_KIND_ICON: Record<NotificationKind, string> = {
  "order.created": "ShoppingCart",
  "order.assigned": "PackageCheck",
  "order.cancelled_by_partner": "AlertTriangle",
  "ticket.created": "MessageCircleQuestion",
};
