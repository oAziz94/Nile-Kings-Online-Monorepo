/**
 * Cart: get/create by userId or guestToken.
 * Stock: validate qty <= stockAvailable - stockReserved.
 * Merge: combine guest cart into user cart on login (sum by variantId).
 */

import { prisma } from "@/lib/db";
import { getOrCreateGuestToken, getGuestToken } from "@/lib/cart/guest";
import { getCurrentUser } from "@/lib/auth/session";
import { piastresToEgp } from "@/lib/catalog";

export type CartItemPayload = {
  id: string;
  variantId: string;
  quantity: number;
  productId: string;
  productName: string;
  productSlug: string;
  /** When set, use for product URL so slug includes size+color (e.g. cotton-tshirt-m-aswak) */
  variantSlug: string | null;
  imageUrl: string | null;
  variantName: string;
  sku: string;
  priceEgp: number;
  maxQty: number;
};

export type CartPayload = {
  id: string;
  items: CartItemPayload[];
  itemCount: number;
  subtotalEgp: number;
};

/** Resolve cart: prefer user cart, else guest cart. Creates cart if missing. */
export async function getOrCreateCart(): Promise<{
  cartId: string;
  userId: string | null;
  guestToken: string | null;
}> {
  const user = await getCurrentUser();

  if (user?.userId) {
    let cart = await prisma.cart.findFirst({
      where: { userId: user.userId },
      select: { id: true },
    });
    if (!cart) {
      cart = await prisma.cart.create({
        data: { userId: user.userId },
        select: { id: true },
      });
    }
    return { cartId: cart.id, userId: user.userId, guestToken: null };
  }

  const guestToken = await getOrCreateGuestToken();
  let cart = await prisma.cart.findUnique({
    where: { guestToken },
    select: { id: true },
  });
  if (!cart) {
    cart = await prisma.cart.create({
      data: { guestToken },
      select: { id: true },
    });
  }
  return { cartId: cart.id, userId: null, guestToken };
}

/** Get cart by ID for response (with variant/product). */
export async function getCartPayload(cartId: string): Promise<CartPayload | null> {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          variant: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  imageUrl: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!cart) return null;

  /** Item display: productSlug-size-colorName (e.g. test-M-اسود) */
  function variantDisplayName(
    productSlug: string,
    size: string,
    colorName: string | null | undefined
  ): string {
    const base = `${productSlug}-${size}`;
    return colorName?.trim() ? `${base}-${colorName.trim()}` : base;
  }

  const items: CartItemPayload[] = cart.items.map((item) => {
    const v = item.variant;
    const p = v.product;
    const maxQty = Math.max(0, v.stockAvailable - v.stockReserved);
    return {
      id: item.id,
      variantId: v.id,
      quantity: item.quantity,
      productId: p.id,
      productName: p.name,
      productSlug: p.slug,
      variantSlug: v.slug ?? null,
      imageUrl: p.imageUrl,
      variantName: variantDisplayName(p.slug, v.name, v.colorName),
      sku: v.sku,
      priceEgp: piastresToEgp(v.pricePiastres),
      maxQty,
    };
  });

  const subtotalEgp = items.reduce(
    (sum, i) => sum + i.priceEgp * i.quantity,
    0
  );

  return {
    id: cart.id,
    items,
    itemCount: items.reduce((s, i) => s + i.quantity, 0),
    subtotalEgp,
  };
}

/** Max quantity allowed for a variant (stockAvailable - stockReserved). */
export async function getMaxQuantityForVariant(variantId: string): Promise<number> {
  const v = await prisma.variant.findUnique({
    where: { id: variantId },
    select: { stockAvailable: true, stockReserved: true },
  });
  if (!v) return 0;
  return Math.max(0, v.stockAvailable - v.stockReserved);
}

/** Merge guest cart into user cart (sum quantities by variantId). Clear guest cart and cookie. */
export async function mergeGuestCartIntoUser(userId: string): Promise<void> {
  const guestToken = await getGuestToken();
  if (!guestToken) return;

  const guestCart = await prisma.cart.findUnique({
    where: { guestToken },
    include: { items: true },
  });
  if (!guestCart || guestCart.items.length === 0) {
    await prisma.cart.deleteMany({ where: { guestToken } });
    return;
  }

  let userCart = await prisma.cart.findFirst({
    where: { userId },
    include: { items: true },
  });
  if (!userCart) {
    userCart = await prisma.cart.create({
      data: { userId },
      include: { items: true },
    });
  }

  const existingByVariant = new Map(
    userCart.items.map((i) => [i.variantId, { id: i.id, quantity: i.quantity }])
  );

  for (const guestItem of guestCart.items) {
    const maxQty = await getMaxQuantityForVariant(guestItem.variantId);
    const existing = existingByVariant.get(guestItem.variantId);
    const addQty = Math.min(guestItem.quantity, maxQty);
    if (addQty <= 0) continue;

    if (existing) {
      const newQty = Math.min(existing.quantity + addQty, maxQty);
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQty },
      });
      existingByVariant.set(guestItem.variantId, {
        id: existing.id,
        quantity: newQty,
      });
    } else {
      const created = await prisma.cartItem.create({
        data: {
          cartId: userCart.id,
          variantId: guestItem.variantId,
          quantity: addQty,
        },
      });
      existingByVariant.set(guestItem.variantId, {
        id: created.id,
        quantity: addQty,
      });
    }
  }

  await prisma.cart.delete({ where: { id: guestCart.id } });
  const { clearGuestCookie } = await import("@/lib/cart/guest");
  await clearGuestCookie();
}
