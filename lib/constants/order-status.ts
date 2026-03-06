/** Order status display labels (Arabic) */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  CREATED: "قيد الانشاء",
  CONFIRMED: "مؤكد",
  PROCESSING: "قيد التجهيز",
  SHIPPED: "تم الشحن",
  DELIVERED: "تم التسليم",
  CANCELLED: "ملغي",
};

export function getOrderStatusLabel(status: string): string {
  return ORDER_STATUS_LABELS[status] ?? status;
}
