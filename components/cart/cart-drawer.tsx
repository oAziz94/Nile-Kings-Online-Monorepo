"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/contexts/cart-context";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/shared/price";
import { X, ShoppingBag, Minus, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&h=200&fit=crop";

export function CartDrawer() {
  const { cart, isDrawerOpen, closeDrawer, refreshCart } = useCart();
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  const updateQty = async (itemId: string, quantity: number) => {
    setUpdatingId(itemId);
    try {
      const res = await fetch(`/api/cart/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      if (res.ok) await refreshCart();
    } finally {
      setUpdatingId(null);
    }
  };

  const removeItem = async (itemId: string) => {
    setUpdatingId(itemId);
    try {
      const res = await fetch(`/api/cart/items/${itemId}`, { method: "DELETE" });
      if (res.ok) await refreshCart();
    } finally {
      setUpdatingId(null);
    }
  };

  if (!isDrawerOpen) return null;

  const isEmpty = !cart || cart.items.length === 0;

  return (
    <>
      <div
        className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm"
        aria-hidden
        onClick={closeDrawer}
      />
      <div
        role="dialog"
        aria-label="سلة التسوق"
        className={cn(
          "fixed top-0 bottom-0 z-[110] w-full max-w-md flex flex-col",
          "bg-background border-border shadow-2xl",
          "rtl:right-0 rtl:left-auto ltr:left-0 ltr:right-auto",
          "animate-in slide-in-from-right duration-300"
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <h2 className="text-lg font-semibold text-foreground">سلة التسوق</h2>
          <Button variant="ghost" size="icon" onClick={closeDrawer} aria-label="إغلاق">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center">
              <div className="rounded-full bg-muted p-6">
                <ShoppingBag className="h-12 w-12 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">سلة التسوق فارغة</p>
              <Button asChild variant="outline" onClick={closeDrawer}>
                <Link href="/categories">تسوق الآن</Link>
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border p-4">
              {cart!.items.map((item) => (
                <li key={item.id} className="flex gap-4 py-4 first:pt-0">
                  <Link
                    href={`/products/${item.variantSlug ?? item.productSlug}`}
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted"
                    onClick={closeDrawer}
                  >
                    <Image
                      src={item.imageUrl || PLACEHOLDER_IMAGE}
                      alt={item.productName}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/products/${item.variantSlug ?? item.productSlug}`}
                      className="font-medium text-foreground hover:underline"
                      onClick={closeDrawer}
                    >
                      {item.productName}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {item.variantName}
                    </p>
                    <Price amount={item.priceEgp} size="sm" className="mt-1" />
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex items-center rounded-xl border border-border">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-r-none"
                          disabled={item.quantity <= 1 || updatingId === item.id}
                          onClick={() => updateQty(item.id, item.quantity - 1)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="min-w-[2rem] text-center text-sm">
                          {item.quantity}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-l-none"
                          disabled={item.quantity >= item.maxQty || updatingId === item.id}
                          onClick={() => updateQty(item.id, item.quantity + 1)}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        disabled={updatingId === item.id}
                        onClick={() => removeItem(item.id)}
                        aria-label="حذف"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!isEmpty && cart && (
          <div className="border-t border-border p-4">
            <div className="mb-4 flex justify-between text-lg font-semibold">
              <span>المجموع</span>
              <Price amount={cart.subtotalEgp} />
            </div>
            <Button asChild className="w-full rounded-2xl" size="lg">
              <Link href="/cart" onClick={closeDrawer}>
                عرض السلة
              </Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
