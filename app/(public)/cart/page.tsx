"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/contexts/cart-context";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/shared/price";
import { ProductCard } from "@/components/shared/product-card";
import { ViewAllButton } from "@/components/shared/view-all-button";
import { ShoppingBag, Minus, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ProductListItem } from "@/lib/catalog";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&h=200&fit=crop";

export default function CartPage() {
  const { cart, refreshCart, setCart } = useCart();
  const { toast } = useToast();
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<ProductListItem[]>([]);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  useEffect(() => {
    fetch("/api/products/recommendations")
      .then((res) => res.json())
      .then((json) => {
        if (json?.success && Array.isArray(json?.data?.products)) {
          setRecommendations(json.data.products);
        }
      })
      .catch(() => {});
  }, []);

  const updateQty = async (itemId: string, quantity: number) => {
    setUpdatingId(itemId);
    try {
      const res = await fetch(`/api/cart/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      const json = await res.json();
      if (res.ok) {
        if (json?.data) setCart(json.data);
      } else {
        toast({
          title: json?.error?.message ?? "حدث خطأ",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  const removeItem = async (itemId: string) => {
    setUpdatingId(itemId);
    try {
      const res = await fetch(`/api/cart/items/${itemId}`, { method: "DELETE" });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) setCart(json.data);
        toast({ title: "تم حذف المنتج من السلة" });
      }
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  const isEmpty = !cart || cart.items.length === 0;

  return (
    <div className="container px-4 py-6">
      <h1 className="text-2xl font-bold text-foreground md:text-3xl">
        سلة التسوق
      </h1>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
          <div className="rounded-full bg-muted p-8">
            <ShoppingBag className="h-16 w-16 text-muted-foreground" />
          </div>
          <p className="text-lg text-muted-foreground">سلة التسوق فارغة</p>
          <Button asChild size="lg" className="rounded-2xl">
            <Link href="/categories">تسوق الآن</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <ul className="lg:col-span-2 divide-y divide-border rounded-2xl border border-border bg-card">
            {cart!.items.map((item) => (
              <li
                key={item.id}
                className="flex gap-4 p-4 first:rounded-t-2xl last:rounded-b-2xl"
              >
                <Link
                  href={`/products/${item.variantSlug ?? item.productSlug}`}
                  className="relative h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-muted"
                >
                  <Image
                    src={item.imageUrl || PLACEHOLDER_IMAGE}
                    alt={item.productName}
                    fill
                    className="object-cover"
                    sizes="112px"
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/products/${item.variantSlug ?? item.productSlug}`}
                    className="text-lg font-semibold text-foreground hover:underline"
                  >
                    {item.productName}
                  </Link>
                  <p className="text-muted-foreground">
                    {item.variantName}
                  </p>
                  <Price amount={item.priceEgp} size="md" className="mt-2" />
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex items-center rounded-xl border border-border">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-r-none"
                        disabled={
                          item.quantity <= 1 || updatingId === item.id
                        }
                        onClick={() =>
                          updateQty(item.id, item.quantity - 1)
                        }
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="min-w-[2.5rem] text-center">
                        {item.quantity.toLocaleString("en-US")}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-l-none"
                        disabled={
                          item.quantity >= item.maxQty ||
                          updatingId === item.id
                        }
                        onClick={() =>
                          updateQty(item.id, item.quantity + 1)
                        }
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={updatingId === item.id}
                      onClick={() => removeItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4 ml-1" />
                      حذف
                    </Button>
                  </div>
                </div>
                <div className="text-left">
                  <p className="font-semibold text-foreground">
                    {(item.priceEgp * item.quantity).toLocaleString("en-US")} ج.م
                  </p>
                </div>
              </li>
            ))}
          </ul>

          <div className="rounded-2xl border border-border bg-card p-6 h-fit">
            <h2 className="text-lg font-semibold text-foreground">ملخص الطلب</h2>
            <div className="mt-4 flex justify-between text-muted-foreground">
              <span>المجموع ({cart!.itemCount.toLocaleString("en-US")} منتج)</span>
              <Price amount={cart!.subtotalEgp} />
            </div>
            <Button
              asChild
              className="mt-6 w-full rounded-2xl"
              size="lg"
            >
              <Link href="/checkout">متابعة للدفع</Link>
            </Button>
            <Button asChild variant="outline" className="mt-3 w-full rounded-2xl">
              <Link href="/categories">متابعة التسوق</Link>
            </Button>
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <section className="mt-12 border-t border-border pt-10 md:py-12" aria-label="قد يعجبك ايضا">
          <div className="mb-8 flex items-center justify-center gap-4 px-4">
            <span className="h-0.5 max-w-12 flex-1 bg-foreground/40" aria-hidden />
            <h2 className="text-2xl font-semibold text-foreground md:text-3xl" dir="rtl">
              قد يعجبك ايضا
            </h2>
            <span className="h-0.5 max-w-12 flex-1 bg-foreground/40" aria-hidden />
          </div>
          <div className="mx-auto grid max-w-5xl grid-cols-1 justify-items-center gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {recommendations.slice(0, 4).map((p) => (
              <ProductCard
                key={p.id}
                className="w-full max-w-[280px]"
                id={p.id}
                name={p.name}
                slug={p.slug}
                imageUrl={p.imageUrl}
                price={p.priceEgp}
                originalPrice={p.originalPriceEgp}
                discountPercent={p.discountPercent}
                colorVariants={p.colorVariants}
                inStock={p.inStock}
              />
            ))}
          </div>
          <ViewAllButton href="/categories" className="mt-10" />
        </section>
      )}
    </div>
  );
}
