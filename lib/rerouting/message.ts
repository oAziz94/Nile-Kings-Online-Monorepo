/**
 * Build WhatsApp order-assignment message for partners (no dashboard).
 * Includes all operational details: order number, date, customer, address, payment, products.
 */

type AddressShape = {
  governorate?: string | null;
  city?: string | null;
  area?: string | null;
  street?: string | null;
  building?: string | null;
  floor?: string | null;
  apartment?: string | null;
  notes?: string | null;
  phone?: string | null;
};

type OrderItemShape = {
  productName: string;
  variantName: string;
  quantity: number;
};

type OrderForMessage = {
  id: string;
  createdAt: Date;
  paymentMethod: string;
  shippingPiastres: number;
  totalPiastres: number;
  shippingAddress: unknown;
  user: { name: string | null; phone: string };
  items: OrderItemShape[];
};

const PAYMENT_LABELS: Record<string, string> = {
  COD: "الدفع عند الاستلام",
  PAYMOB: "مدفوع مسبقًا",
  INSTAPAY_PREPAID: "مدفوع مسبقًا",
};

function formatOrderDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  return `${day}/${month}/${year} - ${h}:${mins} ${ampm}`;
}

function buildAddressLine(addr: AddressShape): string {
  const parts: string[] = [];
  if (addr.street) parts.push(addr.street);
  if (addr.building) parts.push(`مبنى ${addr.building}`);
  if (addr.floor) parts.push(`الدور ${addr.floor}`);
  if (addr.apartment) parts.push(`شقة ${addr.apartment}`);
  return parts.join("، ") || "—";
}

/** Max length for WhatsApp body (conservative to avoid truncation issues). */
const MAX_MESSAGE_LENGTH = 3500;

export function buildOrderAssignmentMessage(order: OrderForMessage): string {
  const addr = (order.shippingAddress || {}) as AddressShape;
  const paymentLabel = PAYMENT_LABELS[order.paymentMethod] ?? "مدفوع مسبقًا";
  const customerName = order.user?.name?.trim() || "—";
  const customerPhone = order.user?.phone || addr.phone || "—";
  const governorate = addr.governorate || "—";
  const cityLine = addr.city?.trim() || "—";
  const area = addr.area || "—";
  const fullAddress = buildAddressLine(addr);
  const customerNotes = addr.notes?.trim();
  const shippingFee = (order.shippingPiastres / 100).toFixed(0);
  const totalEgp = (order.totalPiastres / 100).toFixed(0);

  const lines: string[] = [
    "طلب جديد من ملوك النيل",
    "",
    `رقم الطلب: #${order.id.slice(-8)}`,
    `تاريخ الطلب: ${formatOrderDate(new Date(order.createdAt))}`,
    "",
    `اسم العميل: ${customerName}`,
    `رقم الهاتف: ${customerPhone}`,
    `المحافظة: ${governorate}`,
    `المدينة: ${cityLine}`,
    `المنطقة: ${area}`,
    `العنوان: ${fullAddress}`,
  ];

  if (customerNotes) {
    lines.push(`ملاحظات العميل: ${customerNotes}`);
  }

  lines.push(
    "",
    `طريقة الدفع: ${paymentLabel}`,
    `رسوم الشحن: ${shippingFee} جنيه`,
    `إجمالي الطلب: ${totalEgp} جنيه`,
    "",
    "المنتجات:"
  );

  const maxItems = 25;
  const items = order.items.slice(0, maxItems);
  for (const item of items) {
    const variantPart = item.variantName?.trim() ? ` - ${item.variantName}` : "";
    lines.push(`- ${item.quantity} × ${item.productName}${variantPart}`);
  }
  if (order.items.length > maxItems) {
    lines.push(`... والطلب يحتوي على ${order.items.length - maxItems} صنف إضافي`);
  }

  lines.push("", "برجاء التواصل مع العميل وتنفيذ الطلب.");

  let message = lines.join("\n");
  if (message.length > MAX_MESSAGE_LENGTH) {
    message = message.slice(0, MAX_MESSAGE_LENGTH - 80) + "\n\n... (تم اختصار الرسالة بسبب الطول)";
  }
  return message;
}
