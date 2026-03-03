import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateCart, getCartPayload, getMaxQuantityForVariant } from "@/lib/cart/cart";
import {
  apiSuccess,
  apiBadRequest,
  apiUnprocessable,
  apiInternal,
} from "@/lib/api/response";

export async function POST(req: NextRequest) {
  try {
    let body: { variantId?: string; quantity?: number };
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("جسم الطلب غير صالح");
    }

    const variantId = body.variantId?.trim();
    const quantity = typeof body.quantity === "number" ? body.quantity : 1;

    if (!variantId) {
      return apiBadRequest("معرف المنتج (variantId) مطلوب");
    }
    if (quantity < 1) {
      return apiBadRequest("الكمية يجب أن تكون 1 على الأقل");
    }

    const maxQty = await getMaxQuantityForVariant(variantId);
    if (maxQty < 1) {
      return apiUnprocessable("هذا المقاس غير متوفر حالياً");
    }
    if (quantity > maxQty) {
      return apiUnprocessable(
        `الكمية المتاحة لهذا المقاس: ${maxQty} فقط`
      );
    }

    const { cartId } = await getOrCreateCart();

    const existing = await prisma.cartItem.findUnique({
      where: {
        cartId_variantId: { cartId, variantId },
      },
    });

    if (existing) {
      const newQty = Math.min(existing.quantity + quantity, maxQty);
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQty },
      });
    } else {
      await prisma.cartItem.create({
        data: { cartId, variantId, quantity },
      });
    }

    const cart = await getCartPayload(cartId);
    return apiSuccess(cart ?? { id: cartId, items: [], itemCount: 0, subtotalEgp: 0 }, "تمت الإضافة إلى السلة");
  } catch (e) {
    console.error("POST /api/cart/items", e);
    return apiInternal("خطأ في إضافة المنتج إلى السلة");
  }
}
