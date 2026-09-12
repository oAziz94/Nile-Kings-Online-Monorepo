"use client";

import React, { createContext, useCallback, useContext, useState } from "react";
import { parseJsonResponse } from "@/lib/api/parse-json";

export type CartItem = {
  id: string;
  variantId: string;
  quantity: number;
  productId: string;
  productName: string;
  productSlug: string;
  variantSlug: string | null;
  imageUrl: string | null;
  variantName: string;
  /** Additive display-only fields (backlog 4.10) — see `lib/cart/cart.ts`'s `CartItemPayload`. */
  size?: string | null;
  colorName?: string | null;
  sku: string;
  priceEgp: number;
  maxQty: number;
};

export type Cart = {
  id: string;
  items: CartItem[];
  itemCount: number;
  subtotalEgp: number;
};

type CartContextValue = {
  cart: Cart | null;
  /** True while the initial mount fetch (or an explicit `refreshCart()`) is in flight — lets a
   *  screen show a real loading skeleton instead of treating `cart === null` as "empty" (backlog
   *  4.10). Additive: existing call sites that ignore it behave exactly as before. */
  isLoading: boolean;
  /** True once at least one fetch attempt (success or failure) has completed. */
  hasLoaded: boolean;
  /** True if the most recent fetch attempt failed (network/parse error, not "cart legitimately empty"). */
  hasError: boolean;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  refreshCart: () => Promise<void>;
  setCart: (cart: Cart | null) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const refreshCart = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/cart");
      const json = await parseJsonResponse<{ success?: boolean; data?: Cart }>(res);
      if (json?.success && json.data) {
        setCart(json.data);
        setHasError(false);
      } else {
        setCart(null);
        setHasError(true);
      }
    } catch {
      setCart(null);
      setHasError(true);
    } finally {
      setIsLoading(false);
      setHasLoaded(true);
    }
  }, []);

  React.useEffect(() => {
    refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openDrawer = useCallback(() => {
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const value: CartContextValue = {
    cart,
    isLoading,
    hasLoaded,
    hasError,
    isDrawerOpen,
    openDrawer,
    closeDrawer,
    refreshCart,
    setCart,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }
  return ctx;
}
