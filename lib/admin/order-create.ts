import { prisma } from "@/lib/db";
import type { CheckoutAddress } from "@/lib/checkout/types";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/checkout/types";
import { parseCheckoutAddressInput, savedAddressToCheckout } from "@/lib/admin/address";

export type OrderLineInput = { variantId: string; quantity: number };

export function parseOrderLineItems(
  raw: unknown
): { ok: true; items: OrderLineInput[] } | { ok: false; message: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, message: "أضف صنفاً واحداً على الأقل" };
  }
  const items: OrderLineInput[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") {
      return { ok: false, message: "صيغة الأصناف غير صالحة" };
    }
    const r = row as Record<string, unknown>;
    const variantId = typeof r.variantId === "string" ? r.variantId.trim() : "";
    const quantity = typeof r.quantity === "number" ? Math.trunc(r.quantity) : parseInt(String(r.quantity ?? ""), 10);
    if (!variantId) return { ok: false, message: "معرّف المتغير مطلوب لكل صنف" };
    if (!Number.isFinite(quantity) || quantity < 1) {
      return { ok: false, message: "الكمية يجب أن تكون 1 على الأقل" };
    }
    items.push({ variantId, quantity });
  }
  return { ok: true, items };
}

export async function resolveOrderCheckoutAddress(input: {
  userId: string;
  savedAddressId?: string | null;
  address?: unknown;
}): Promise<{ ok: true; address: CheckoutAddress } | { ok: false; message: string }> {
  if (input.savedAddressId) {
    const saved = await prisma.savedAddress.findFirst({
      where: { id: input.savedAddressId, userId: input.userId },
    });
    if (!saved) return { ok: false, message: "العنوان غير موجود لهذا العميل" };
    const city = saved.city?.trim();
    if (!city) return { ok: false, message: "عنوان العميل المحفوظ يفتقد المدينة — عدّل العنوان أولاً" };
    return { ok: true, address: savedAddressToCheckout(saved) };
  }
  const parsed = parseCheckoutAddressInput(input.address);
  if (!parsed.ok) return parsed;
  return { ok: true, address: parsed.address };
}

export function parsePaymentMethod(raw: unknown): { ok: true; method: PaymentMethod } | { ok: false; message: string } {
  const method = typeof raw === "string" ? raw.trim() : "";
  if (!method || !PAYMENT_METHODS.includes(method as PaymentMethod)) {
    return { ok: false, message: "طريقة الدفع مطلوبة (COD أو PAYMOB أو InstaPay)" };
  }
  return { ok: true, method: method as PaymentMethod };
}
