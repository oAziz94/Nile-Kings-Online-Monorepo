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
  imageUrl: string | null;
  variantName: string;
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

  React.useEffect(() => {
    fetch("/api/cart")
      .then((res) => parseJsonResponse<{ success?: boolean; data?: Cart }>(res))
      .then((json) => {
        if (json?.success && json.data) setCart(json.data);
      })
      .catch(() => {});
  }, []);

  const refreshCart = useCallback(async () => {
    try {
      const res = await fetch("/api/cart");
      const json = await parseJsonResponse<{ success?: boolean; data?: Cart }>(res);
      if (json?.success && json.data) {
        setCart(json.data);
      } else {
        setCart(null);
      }
    } catch {
      setCart(null);
    }
  }, []);

  const openDrawer = useCallback(() => {
    setIsDrawerOpen(true);
    refreshCart();
  }, [refreshCart]);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
  }, []);

  const value: CartContextValue = {
    cart,
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
