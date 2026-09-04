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
