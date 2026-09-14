/** Order status display labels (Arabic) */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  CREATED: "قيد الانشاء",
  CONFIRMED: "مؤكد",
  PROCESSING: "قيد التجهيز",
  READY_TO_SHIP: "جاهز للشحن",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

export function getOrderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}

export const ORDER_STATUSES = [
  "CREATED",
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
] as const;

/** Status badge colors, derived from the theme's token palette (burgundy/gold/emerald/destructive). */
export const ORDER_STATUS_BADGE_CLASSES: Record<string, string> = {
  CREATED: "border-border bg-muted text-muted-foreground",
  CONFIRMED: "border-gold/40 bg-gold/15 text-foreground",
  PROCESSING: "border-gold/40 bg-gold/15 text-foreground",
  READY_TO_SHIP: "border-burgundy/30 bg-burgundy/10 text-burgundy",
  SHIPPED: "border-burgundy/30 bg-burgundy/10 text-burgundy",
  DELIVERED: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700",
  CANCELLED: "border-destructive/30 bg-destructive/10 text-destructive",
};

/**
 * One status → colour vocabulary (backlog 6.4), lifted byte-for-byte from
 * `design-canvas/account/build.mjs`'s `STATUS` table. Used by the account-area orders screen's
 * status pill (`.pill` = 13px/500 text with a 7px leading dot) — the screen no longer keeps its
 * own local colour map (the pre-redesign screen's `statusColors` had `READY_TO_SHIP` missing).
 */
/**
 * Admin v2 pill variant (`components/ui/badge.tsx`'s named variants) per status — lifted out
 * of `app/(admin)/admin/orders/page.tsx` (backlog 9.4a) so the profile's الطلبات tab
 * (`components/admin/partner-orders-tab.tsx`) renders the exact same status colours instead
 * of a second copy of this table.
 */
export const ADMIN_ORDER_STATUS_PILL_VARIANT: Record<
  string,
  "success" | "warning" | "info" | "neutral" | "danger"
> = {
  CREATED: "info",
  CONFIRMED: "warning",
  PROCESSING: "warning",
  READY_TO_SHIP: "info",
  SHIPPED: "neutral",
  DELIVERED: "success",
  CANCELLED: "danger",
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  CREATED: "#8A8C9A",
  CONFIRMED: "#3B6EA5",
  PROCESSING: "hsl(var(--gold-500))",
  READY_TO_SHIP: "#6B4FA5",
  SHIPPED: "#6B4FA5",
  DELIVERED: "#2F6B4C",
  CANCELLED: "#A83A2A",
};
