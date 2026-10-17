import { normalizeEgyptMobilePhone, EGYPT_MOBILE_ERROR_MESSAGE } from "@/lib/phone";

/** Request validation for `POST /api/partner/sales` (backlog 11.3). Pure, no db. */

export const MAX_SALE_LINES = 50;
export const MIN_LINE_QTY = 1;
export const MAX_LINE_QTY = 99;

export const PAYMENT_METHODS = ["CASH", "INSTAPAY", "CARD"] as const;
export type SalePaymentMethod = (typeof PAYMENT_METHODS)[number];

export type SaleInput = {
  items: { variantId: string; quantity: number }[];
  paymentMethod: SalePaymentMethod;
  customerPhone: string | null;
  customerName: string | null;
  sellerName: string | null;
  notes: string | null;
};

export type SaleValidation = { ok: true; value: SaleInput } | { ok: false; message: string };

function optionalText(raw: unknown, max: number): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

const QTY_MESSAGE = `الكمية يجب أن تكون بين ${MIN_LINE_QTY} و ${MAX_LINE_QTY}`;

/** Duplicate variants are merged (quantities summed) so a line is one variant. */
export function validateSaleBody(body: unknown): SaleValidation {
  if (!body || typeof body !== "object") return { ok: false, message: "جسم الطلب غير صالح" };
  const b = body as Record<string, unknown>;

  if (!Array.isArray(b.items) || b.items.length === 0) {
    return { ok: false, message: "أضف صنفاً واحداً على الأقل" };
  }
  if (b.items.length > MAX_SALE_LINES) {
    return { ok: false, message: `الحد الأقصى ${MAX_SALE_LINES} بنداً في الإيصال الواحد` };
  }

  const merged = new Map<string, number>();
  for (const raw of b.items as unknown[]) {
    if (!raw || typeof raw !== "object") return { ok: false, message: "بند غير صالح" };
    const item = raw as { variantId?: unknown; quantity?: unknown };
    const variantId = typeof item.variantId === "string" ? item.variantId.trim() : "";
    if (!variantId) return { ok: false, message: "بند غير صالح" };
    if (
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity < MIN_LINE_QTY ||
      item.quantity > MAX_LINE_QTY
    ) {
      return { ok: false, message: QTY_MESSAGE };
    }
    const total = (merged.get(variantId) ?? 0) + item.quantity;
    if (total > MAX_LINE_QTY) return { ok: false, message: QTY_MESSAGE };
    merged.set(variantId, total);
  }

  if (!PAYMENT_METHODS.includes(b.paymentMethod as SalePaymentMethod)) {
    return { ok: false, message: "طريقة الدفع غير صالحة" };
  }

  let customerPhone: string | null = null;
  if (typeof b.customerPhone === "string" && b.customerPhone.trim()) {
    customerPhone = normalizeEgyptMobilePhone(b.customerPhone);
    if (!customerPhone) return { ok: false, message: EGYPT_MOBILE_ERROR_MESSAGE };
  }

  return {
    ok: true,
    value: {
      items: Array.from(merged.entries()).map(([variantId, quantity]) => ({ variantId, quantity })),
      paymentMethod: b.paymentMethod as SalePaymentMethod,
      customerPhone,
      customerName: optionalText(b.customerName, 100),
      sellerName: optionalText(b.sellerName, 60),
      notes: optionalText(b.notes, 500),
    },
  };
}
