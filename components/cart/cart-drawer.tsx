"use client";

import * as React from "react";
import Link from "next/link";
import { CatalogImage } from "@/components/shared/catalog-image";
import { useCart } from "@/contexts/cart-context";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetCloseButton,
} from "@/components/ui/sheet";
import { friendlyVariantLabel } from "@/lib/cart/variant-label";
import { ShoppingBag, Minus, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&h=200&fit=crop";

/**
 * Mini-cart drawer (backlog 4.10) — same line language as the full cart page at a smaller scale
 * (image, name, friendly variant label, unit price omitted for space, stepper, remove, subtotal),
 * no recommendations rail. Rebuilt on `components/ui/sheet.tsx` (real Radix Dialog primitive) so
 * Escape/overlay-click close and focus management are real, not hand-rolled — the previous
 * version had neither.
 */
export function CartDrawer() {
  const { cart, isDrawerOpen, closeDrawer, setCart, refreshCart } = useCart();
  const { toast } = useToast();
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);

  const updateQty = async (itemId: string, quantity: number) => {
    setUpdatingId(itemId);
    try {
      const res = await fetch(`/api/cart/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        if (json?.data) setCart(json.data);
      } else {
        toast({ title: json?.error?.message ?? "حدث خطأ", variant: "destructive" });
        await refreshCart();
      }
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
      await refreshCart();
    } finally {
      setUpdatingId(null);
    }
  };

  const removeItem = async (itemId: string) => {
    setUpdatingId(itemId);
    try {
      const res = await fetch(`/api/cart/items/${itemId}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        if (json?.data) setCart(json.data);
        toast({ title: "تم حذف المنتج من السلة" });
      } else {
        toast({ title: json?.error?.message ?? "حدث خطأ", variant: "destructive" });
        await refreshCart();
      }
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
      await refreshCart();
    } finally {
      setUpdatingId(null);
    }
  };

  const isEmpty = !cart || cart.items.length === 0;

  return (
    <Sheet open={isDrawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
      <SheetContent aria-label="سلة التسوق">
        <SheetHeader>
          <SheetTitle>سلة التسوق</SheetTitle>
          <SheetCloseButton />
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isEmpty ? (
            <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center border border-[hsl(228_16%_82%)] text-[hsl(228_18%_45%)]">
                <ShoppingBag className="h-8 w-8" strokeWidth={1.3} />
              </div>
              <p className="font-amiri text-lg font-bold text-[hsl(228_40%_14%)]">
                سلة التسوق فارغة
              </p>
              <Button asChild variant="outline" className="rounded-none" onClick={closeDrawer}>
                <Link href="/categories">تسوق الآن</Link>
              </Button>
            </div>
          ) : (
            <ul className="list-none divide-y divide-[hsl(228_16%_88%)] px-4">
              {cart!.items.map((item) => {
                const label = friendlyVariantLabel(item);
                return (
                  <li key={item.id} className="flex gap-4 py-4">
                    <Link
                      href={`/products/${item.variantSlug ?? item.productSlug}`}
                      className="relative aspect-[4/5] h-20 shrink-0 overflow-hidden bg-[hsl(38_22%_93%)]"
                      onClick={closeDrawer}
                    >
                      <CatalogImage
                        src={item.imageUrl || PLACEHOLDER_IMAGE}
                        alt={item.productName}
                        fill
                        className="object-cover"
                        sizes="80px"
                      />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/products/${item.variantSlug ?? item.productSlug}`}
                          className="font-amiri text-base font-bold text-[hsl(228_40%_14%)] hover:underline"
                          onClick={closeDrawer}
                        >
                          {item.productName}
                        </Link>
                        <button
                          type="button"
                          aria-label={`إزالة ${item.productName} من السلة`}
                          disabled={updatingId === item.id}
                          onClick={() => removeItem(item.id)}
                          className="shrink-0 text-[hsl(228_18%_45%)] transition-colors hover:text-[hsl(228_40%_14%)] disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.3} />
                        </button>
                      </div>
                      <p className="text-xs text-[hsl(228_18%_45%)]">{label}</p>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="inline-flex h-9 items-center border border-[hsl(228_40%_14%)]">
                          <button
                            type="button"
                            aria-label={`تقليل كمية ${item.productName}`}
                            disabled={item.quantity <= 1 || updatingId === item.id}
                            onClick={() => updateQty(item.id, item.quantity - 1)}
                            className="grid h-full w-8 place-items-center text-[hsl(228_40%_14%)] disabled:opacity-40"
                          >
                            <Minus className="h-3 w-3" strokeWidth={1.3} />
                          </button>
                          <span
                            aria-live="polite"
                            className="grid h-full w-8 place-items-center border-x border-[hsl(228_40%_14%)] font-archivo text-xs font-medium"
                          >
                            {item.quantity.toLocaleString("en-US")}
                          </span>
                          <button
                            type="button"
                            aria-label={`زيادة كمية ${item.productName}`}
                            disabled={item.quantity >= item.maxQty || updatingId === item.id}
                            onClick={() => updateQty(item.id, item.quantity + 1)}
                            className="grid h-full w-8 place-items-center text-[hsl(228_40%_14%)] disabled:opacity-40"
                          >
                            <Plus className="h-3 w-3" strokeWidth={1.3} />
                          </button>
                        </div>
                        <span className="font-archivo text-sm font-semibold" style={{ direction: "ltr" }}>
                          {(item.priceEgp * item.quantity).toLocaleString("en-US")}
                          <span className="font-plex-arabic ms-1 text-xs font-normal text-[hsl(228_18%_45%)]">
                            ج.م
                          </span>
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!isEmpty && cart && (
          <div className="border-t border-[hsl(228_16%_86%)] p-4">
            <div className="mb-4 flex items-baseline justify-between">
              <span className="font-medium text-[hsl(228_40%_14%)]">المجموع الفرعي</span>
              <span className="font-archivo text-lg font-semibold" style={{ direction: "ltr" }}>
                {cart.subtotalEgp.toLocaleString("en-US")}{" "}
                <span className="font-plex-arabic text-sm font-normal text-[hsl(228_18%_45%)]">
                  ج.م
                </span>
              </span>
            </div>
            <Button asChild className="w-full rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]" size="lg">
              <Link href="/cart" onClick={closeDrawer}>
                عرض السلة
              </Link>
            </Button>
            <button
              type="button"
              onClick={closeDrawer}
              className="mt-3 w-full border-b border-gold-500 pb-0.5 text-center text-sm text-[hsl(228_40%_14%)] transition-colors hover:text-gold-600"
            >
              متابعة التسوق
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
