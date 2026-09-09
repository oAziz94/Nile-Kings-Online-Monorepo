/**
 * When the customer's delivery governorate changes, the partner (and therefore stock)
 * backing their cart can change too. Called right after the new governorate cookie is
 * set, so the cart never silently holds items the new partner can't fulfill.
 */

import { prisma } from "@/lib/db";
import { getStorefrontStockContext, getPartnerStockOverrides } from "@/lib/storefront-location";

export type RemovedCartItem = { productName: string; variantName: string };

/** Item display: productSlug-size-colorName (e.g. test-M-اسود) — matches lib/cart/cart.ts and lib/checkout/place-order.ts. */
function variantDisplayName(
  productSlug: string,
  size: string,
  colorName: string | null | undefined
): string {
  const base = `${productSlug}-${size}`;
  return colorName?.trim() ? `${base}-${colorName.trim()}` : base;
}

/**
 * Delete cart items that the partner covering `governorate` has zero stock for.
 * Returns the removed items so the caller can tell the customer what disappeared.
 */
export async function pruneCartItemsForGovernorate(
  cartId: string,
  governorate: string | null
): Promise<RemovedCartItem[]> {
  const cart = await prisma.cart.findUnique({
    where: { id: cartId },
    include: {
      items: {
        include: {
          variant: {
            select: {
              id: true,
              name: true,
              colorName: true,
              product: { select: { slug: true, name: true } },
            },
          },
        },
      },
    },
  });
  if (!cart || cart.items.length === 0) return [];

  const { partnerId } = await getStorefrontStockContext(governorate);
  const variantIds = cart.items.map((item) => item.variantId);
  const overrides = await getPartnerStockOverrides(variantIds, partnerId);
  // null overrides means "no partner override to apply" (getPartnerStockOverrides only
  // returns null for an empty variant list here, which can't happen since cart.items isn't empty).
  if (!overrides) return [];

  const unavailable = cart.items.filter((item) => (overrides.get(item.variantId) ?? 0) <= 0);
  if (unavailable.length === 0) return [];

  await prisma.cartItem.deleteMany({
    where: { id: { in: unavailable.map((item) => item.id) } },
  });

  return unavailable.map((item) => ({
    productName: item.variant.product.name,
    variantName: variantDisplayName(item.variant.product.slug, item.variant.name, item.variant.colorName),
  }));
}
