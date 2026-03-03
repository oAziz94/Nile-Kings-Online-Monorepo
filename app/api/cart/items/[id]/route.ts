import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateCart, getCartPayload, getMaxQuantityForVariant } from "@/lib/cart/cart";
import {
  apiSuccess,
  apiBadRequest,
  apiNotFound,
  apiUnprocessable,
  apiInternal,
} from "@/lib/api/response";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id: itemId } = await params;
    let body: { quantity?: number };
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("جسم الطلب غير صالح");
    }

    const quantity = body.quantity;
    if (typeof quantity !== "number" || quantity < 0) {
      return apiBadRequest("الكمية مطلوبة ويجب أن تكون 0 أو أكثر");
    }

    const { cartId } = await getOrCreateCart();

    const item = await prisma.cartItem.findFirst({
      where: { id: itemId, cartId },
      include: { variant: true },
    });

    if (!item) {
      return apiNotFound("عنصر السلة غير موجود");
    }

    if (quantity === 0) {
      await prisma.cartItem.delete({ where: { id: itemId } });
      const cart = await getCartPayload(cartId);
      return apiSuccess(cart ?? { id: cartId, items: [], itemCount: 0, subtotalEgp: 0 }, "تم التحديث");
    }

    const maxQty = await getMaxQuantityForVariant(item.variantId);
    if (quantity > maxQty) {
      return apiUnprocessable(
        `الكمية المتاحة لهذا المقاس: ${maxQty} فقط`
      );
    }

    await prisma.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });

    const cart = await getCartPayload(cartId);
    return apiSuccess(cart ?? { id: cartId, items: [], itemCount: 0, subtotalEgp: 0 }, "تم التحديث");
  } catch (e) {
    console.error("PATCH /api/cart/items/[id]", e);
    return apiInternal("خطأ في تحديث السلة");
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { id: itemId } = await params;
    const { cartId } = await getOrCreateCart();

    const item = await prisma.cartItem.findFirst({
      where: { id: itemId, cartId },
    });

    if (!item) {
      return apiNotFound("عنصر السلة غير موجود");
    }

    await prisma.cartItem.delete({ where: { id: itemId } });

    const cart = await getCartPayload(cartId);
    return apiSuccess(cart ?? { id: cartId, items: [], itemCount: 0, subtotalEgp: 0 }, "تم الحذف");
  } catch (e) {
    console.error("DELETE /api/cart/items/[id]", e);
    return apiInternal("خطأ في حذف العنصر");
  }
}
