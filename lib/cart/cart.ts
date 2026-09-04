/**
 * Cart: get/create by userId or guestToken.
 * Stock: validate qty <= stockAvailable - stockReserved.
 * Merge: combine guest cart into user cart on login (sum by variantId).
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getOrCreateGuestToken, getGuestToken } from "@/lib/cart/guest";
import { getCurrentUser } from "@/lib/auth/session";
import { piastresToEgp } from "@/lib/catalog";
import {
  getCurrentStorefrontStockContext,
  getStorefrontSellableQuantityForVariant,
} from "@/lib/storefront-location";

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

async function getSellableQuantitiesByVariant(variantIds: string[]): Promise<Map<string, number>> {
  if (variantIds.length === 0) return new Map();
  const context = await getCurrentStorefrontStockContext();
  if (!context.partnerId) {
    const variants = await prisma.variant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true, stockAvailable: true, stockReserved: true },
    });
    return new Map(
      variants.map((variant) => [
        variant.id,
        Math.max(0, variant.stockAvailable - variant.stockReserved),
      ])
    );
  }
  const rows = await prisma.partnerInventory.findMany({
    where: {
      partnerId: context.partnerId,
      variantId: { in: variantIds },
    },
    select: { variantId: true, stockAvailable: true, stockReserved: true },
  });
  return new Map(
    rows.map((row) => [
      row.variantId,
      Math.max(0, row.stockAvailable - row.stockReserved),
    ])
  );
}

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
                  active: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!cart) return null;

  const inactiveItemIds = cart.items
    .filter((item) => !item.variant.product.active)
    .map((item) => item.id);
  if (inactiveItemIds.length > 0) {
    await prisma.cartItem.deleteMany({ where: { id: { in: inactiveItemIds } } });
  }
  const activeItems = cart.items.filter((item) => item.variant.product.active);

  /** Item display: productSlug-size-colorName (e.g. test-M-اسود) */
  function variantDisplayName(
    productSlug: string,
    size: string,
    colorName: string | null | undefined
  ): string {
    const base = `${productSlug}-${size}`;
    return colorName?.trim() ? `${base}-${colorName.trim()}` : base;
  }

  const sellableByVariant = await getSellableQuantitiesByVariant(
    activeItems.map((item) => item.variantId)
  );

  const items: CartItemPayload[] = activeItems.map((item) => {
    const v = item.variant;
    const p = v.product;
    const maxQty = sellableByVariant.get(v.id) ?? 0;
    return {
      id: item.id,
      variantId: v.id,
      quantity: item.quantity,
      productId: p.id,
      productName: p.name,
      productSlug: p.slug,
      variantSlug: v.slug ?? null,
      imageUrl: v.imageUrl?.trim() || p.imageUrl,
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

/** Max quantity allowed for a variant from active partner inventory. */
export async function getMaxQuantityForVariant(variantId: string): Promise<number> {
  const v = await prisma.variant.findUnique({
    where: { id: variantId },
    select: {
      product: { select: { active: true } },
    },
  });
  if (!v || !v.product.active) return 0;
  return getStorefrontSellableQuantityForVariant(variantId);
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

  // Batch max-quantity lookups (active check + sellable stock) instead of 2 queries per item.
  const guestVariantIds = guestCart.items.map((i) => i.variantId);
  const [activeVariants, sellableByVariant] = await Promise.all([
    prisma.variant.findMany({
      where: { id: { in: guestVariantIds } },
      select: { id: true, product: { select: { active: true } } },
    }),
    getSellableQuantitiesByVariant(guestVariantIds),
  ]);
  const activeVariantIds = new Set(
    activeVariants.filter((v) => v.product.active).map((v) => v.id)
  );

  // Cart items are unique per (cartId, variantId), so each guestItem's variantId is distinct —
  // safe to build all writes up front and run them in one batched transaction.
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const guestItem of guestCart.items) {
    const maxQty = activeVariantIds.has(guestItem.variantId)
      ? sellableByVariant.get(guestItem.variantId) ?? 0
      : 0;
    const existing = existingByVariant.get(guestItem.variantId);
    const addQty = Math.min(guestItem.quantity, maxQty);
    if (addQty <= 0) continue;

    if (existing) {
      const newQty = Math.min(existing.quantity + addQty, maxQty);
      ops.push(
        prisma.cartItem.update({
          where: { id: existing.id },
          data: { quantity: newQty },
        })
      );
    } else {
      ops.push(
        prisma.cartItem.create({
          data: {
            cartId: userCart.id,
            variantId: guestItem.variantId,
            quantity: addQty,
          },
        })
      );
    }
  }
  if (ops.length > 0) await prisma.$transaction(ops);

  await prisma.cart.delete({ where: { id: guestCart.id } });
  const { clearGuestCookie } = await import("@/lib/cart/guest");
  await clearGuestCookie();
}
