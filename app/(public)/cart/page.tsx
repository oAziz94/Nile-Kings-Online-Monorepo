"use client";

import * as React from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { CatalogImage } from "@/components/shared/catalog-image";
import { useCart, type CartItem } from "@/contexts/cart-context";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/shared/skeleton";
import { ProductCard } from "@/components/shared/product-card";
import { ViewAllButton } from "@/components/shared/view-all-button";
import { friendlyVariantLabel } from "@/lib/cart/variant-label";
import { ShoppingBag, Minus, Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { productCardLabel } from "@/lib/catalog";
import type { ProductListItem } from "@/lib/catalog";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&h=200&fit=crop";

function CartLineImage({ item }: { item: CartItem }) {
  const href = `/products/${item.variantSlug ?? item.productSlug}`;
  return (
    <Link
      href={href}
      className="relative block aspect-[4/5] h-[88px] shrink-0 overflow-hidden bg-[hsl(38_22%_93%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 md:h-[120px]"
    >
      <CatalogImage
        src={item.imageUrl || PLACEHOLDER_IMAGE}
        alt={item.productName}
        fill
        fit="auto"
        sizes="120px"
      />
    </Link>
  );
}

function QuantityStepper({
  item,
  updating,
  onChange,
}: {
  item: CartItem;
  updating: boolean;
  onChange: (quantity: number) => void;
}) {
  return (
    <div className="inline-flex h-10 items-center border border-[hsl(228_40%_14%)] md:h-11">
      <button
        type="button"
        aria-label={`تقليل كمية ${item.productName}`}
        disabled={item.quantity <= 1 || updating}
        onClick={() => onChange(item.quantity - 1)}
        className="grid h-full w-10 place-items-center text-[hsl(228_40%_14%)] transition-colors hover:bg-[hsl(38_22%_93%)] disabled:pointer-events-none disabled:opacity-40"
      >
        <Minus className="h-4 w-4" strokeWidth={1.3} />
      </button>
      <span
        aria-live="polite"
        className="grid h-full w-10 place-items-center border-x border-[hsl(228_40%_14%)] font-archivo text-sm font-medium"
      >
        {item.quantity.toLocaleString("en-US")}
      </span>
      <button
        type="button"
        aria-label={`زيادة كمية ${item.productName}`}
        disabled={item.quantity >= item.maxQty || updating}
        onClick={() => onChange(item.quantity + 1)}
        className="grid h-full w-10 place-items-center text-[hsl(228_40%_14%)] transition-colors hover:bg-[hsl(38_22%_93%)] disabled:pointer-events-none disabled:opacity-40"
      >
        <Plus className="h-4 w-4" strokeWidth={1.3} />
      </button>
    </div>
  );
}

function LineTotal({ item, className }: { item: CartItem; className?: string }) {
  return (
    <span className={className}>
      <span className="font-archivo text-base font-semibold text-[hsl(228_40%_14%)] md:text-lg" style={{ direction: "ltr" }}>
        {(item.priceEgp * item.quantity).toLocaleString("en-US")}
      </span>{" "}
      <span className="font-plex-arabic text-xs text-[hsl(228_18%_45%)]">ج.م</span>
    </span>
  );
}

function CartLine({
  item,
  updating,
  onQtyChange,
  onRemove,
}: {
  item: CartItem;
  updating: boolean;
  onQtyChange: (quantity: number) => void;
  onRemove: () => void;
}) {
  const href = `/products/${item.variantSlug ?? item.productSlug}`;
  const label = friendlyVariantLabel(item);

  return (
    <li className="border-b border-[hsl(228_16%_84%)] py-[18px] md:py-6">
      {/* Desktop: image / details / line total, three columns */}
      <div className="hidden gap-6 md:grid md:grid-cols-[120px_1fr_auto]">
        <CartLineImage item={item} />
        <div className="flex min-w-0 flex-col gap-2">
          <Link href={href} className="font-amiri text-xl font-normal text-[hsl(228_40%_14%)] hover:underline">
            {item.productName}
          </Link>
          <span className="text-sm text-[hsl(228_18%_45%)]">{label}</span>
          <span className="text-sm text-[hsl(228_18%_45%)]">
            سعر القطعة:{" "}
            <span className="font-archivo text-[hsl(228_40%_14%)]" style={{ direction: "ltr" }}>
              {item.priceEgp.toLocaleString("en-US")}
            </span>{" "}
            ج.م
          </span>
          <div className="mt-auto flex items-center gap-5 pt-2">
            <QuantityStepper item={item} updating={updating} onChange={onQtyChange} />
            <button
              type="button"
              disabled={updating}
              onClick={onRemove}
              className="inline-flex items-center gap-1.5 text-sm text-[hsl(228_18%_45%)] transition-colors hover:text-[hsl(228_40%_14%)] disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.3} />
              إزالة
            </button>
          </div>
        </div>
        <LineTotal item={item} className="pt-1.5" />
      </div>

      {/* Mobile: image / details, remove icon top-inline-end, total inline with the stepper */}
      <div className="grid grid-cols-[88px_1fr] gap-3.5 md:hidden">
        <CartLineImage item={item} />
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <Link href={href} className="font-amiri text-[17px] font-normal text-[hsl(228_40%_14%)] hover:underline">
              {item.productName}
            </Link>
            <button
              type="button"
              aria-label={`إزالة ${item.productName} من السلة`}
              disabled={updating}
              onClick={onRemove}
              className="-me-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center text-[hsl(228_18%_45%)] disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" strokeWidth={1.3} />
            </button>
          </div>
          <span className="text-xs text-[hsl(228_18%_45%)]">{label}</span>
          <div className="mt-1.5 flex items-center justify-between">
            <QuantityStepper item={item} updating={updating} onChange={onQtyChange} />
            <LineTotal item={item} />
          </div>
        </div>
      </div>
    </li>
  );
}

function CartSummary({ itemCount, subtotalEgp }: { itemCount: number; subtotalEgp: number }) {
  return (
    <aside
      aria-labelledby="cart-summary-heading"
      className="flex flex-col gap-4 border border-[hsl(228_40%_14%)] p-6 md:sticky md:top-24"
    >
      <h2 id="cart-summary-heading" className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)] md:text-[28px]">
        ملخص الطلب
      </h2>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-3 text-sm">
        <dt className="text-[hsl(228_18%_45%)]">عدد القطع</dt>
        <dd className="m-0 font-archivo">{itemCount.toLocaleString("en-US")}</dd>
        <dt className="text-[hsl(228_18%_45%)]">المجموع الفرعي</dt>
        <dd className="m-0 font-archivo" style={{ direction: "ltr" }}>
          {subtotalEgp.toLocaleString("en-US")} <span className="font-plex-arabic text-[hsl(228_18%_45%)]">ج.م</span>
        </dd>
        <dt className="text-[hsl(228_18%_45%)]">الشحن</dt>
        <dd className="m-0 text-[13px] text-[hsl(228_18%_45%)]">يُحسب عند الدفع حسب المحافظة</dd>
      </dl>
      <div className="flex items-baseline justify-between border-t border-[hsl(228_40%_14%)] pt-4">
        <span className="font-medium text-[hsl(228_40%_14%)]">الإجمالي</span>
        <span className="font-archivo text-2xl font-semibold text-[hsl(228_40%_14%)]" style={{ direction: "ltr" }}>
          {subtotalEgp.toLocaleString("en-US")}{" "}
          <span className="font-plex-arabic text-sm font-normal text-[hsl(228_18%_45%)]">ج.م</span>
        </span>
      </div>
      <Button
        asChild
        size="lg"
        className="h-14 w-full rounded-none bg-[hsl(228_40%_14%)] text-base font-medium text-papyrus hover:bg-[hsl(228_40%_20%)]"
      >
        <Link href="/checkout">متابعة للدفع</Link>
      </Button>
      <Link
        href="/categories"
        className="self-center border-b border-gold-500 pb-0.5 text-sm text-[hsl(228_40%_14%)] transition-colors hover:text-gold-600"
      >
        متابعة التسوق
      </Link>
      <p className="m-0 text-center text-xs leading-relaxed text-[hsl(228_18%_45%)]">
        الدفع عند الاستلام أو عبر إنستاباي. يُحسب الشحن في الخطوة التالية حسب المحافظة.
      </p>
    </aside>
  );
}

function CartSkeleton() {
  return (
    <div role="status" aria-label="جارٍ تحميل السلة" className="mt-5 grid gap-10 lg:grid-cols-[7fr_4fr] lg:gap-16">
      <ul className="list-none divide-y divide-[hsl(228_16%_84%)] border-t border-[hsl(228_16%_84%)] p-0">
        {[0, 1].map((i) => (
          <li key={i} className="grid grid-cols-[88px_1fr] gap-4 py-5 md:grid-cols-[120px_1fr_auto] md:gap-6">
            <Skeleton className="aspect-[4/5] h-[88px] md:h-[120px]" />
            <div className="flex flex-col gap-3">
              <Skeleton className="h-5 w-2/3 max-w-[220px]" />
              <Skeleton className="h-4 w-1/3 max-w-[140px]" />
              <Skeleton className="h-10 w-[120px]" />
            </div>
          </li>
        ))}
      </ul>
      <Skeleton className="h-[360px] w-full" />
    </div>
  );
}

function RecommendationsRail({ products }: { products: ProductListItem[] }) {
  if (products.length === 0) return null;
  return (
    <section className="mt-24 border-t border-[hsl(228_16%_84%)] pt-10" aria-labelledby="cart-recs-heading">
      <h2 id="cart-recs-heading" className="mb-7 font-amiri text-[28px] font-bold text-[hsl(228_40%_14%)] md:text-[34px]">
        قد يعجبك أيضًا
      </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 md:gap-6">
        {products.slice(0, 4).map((p) => (
          <ProductCard
            key={p.id}
            id={p.id}
            name={p.name}
            slug={p.slug}
            imageUrl={p.imageUrl}
            price={p.priceEgp}
            originalPrice={p.originalPriceEgp}
            discountPercent={p.discountPercent}
            colorVariants={p.colorVariants}
            inStock={p.inStock}
            categoryLabel={productCardLabel(p)}
            compact
          />
        ))}
      </div>
      <ViewAllButton href="/categories" />
    </section>
  );
}

export default function CartPage() {
  const { cart, isLoading, hasLoaded, hasError, refreshCart, setCart } = useCart();
  const { toast } = useToast();
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<ProductListItem[]>([]);

  useEffect(() => {
    refreshCart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // `cart === null` while the initial fetch is in flight → a real loading skeleton (backlog
  // 4.10), distinct from "confirmed empty". A failed initial fetch (hasLoaded but hasError, and
  // never got a cart) renders an in-page, styled retry block instead of a silent empty state.
  const showLoadingSkeleton = isLoading && !hasLoaded;
  const showInitialLoadError = !isLoading && hasError && !cart;
  const isEmpty = !showLoadingSkeleton && !showInitialLoadError && (!cart || cart.items.length === 0);
  const hasLines = !showLoadingSkeleton && !showInitialLoadError && !!cart && cart.items.length > 0;

  return (
    <div className="container px-4 py-7 md:px-12 md:py-8">
      <div className="flex items-baseline gap-4">
        <h1 className="font-amiri text-[36px] font-bold text-[hsl(228_40%_14%)] md:text-5xl">
          سلة التسوق
        </h1>
        {!showLoadingSkeleton && (
          <span className="text-sm text-[hsl(228_18%_45%)] md:text-[14px]">
            <span className="font-archivo font-semibold text-[hsl(228_40%_14%)]">
              {(cart?.itemCount ?? 0).toLocaleString("en-US")}
            </span>{" "}
            منتجات
          </span>
        )}
      </div>

      {showLoadingSkeleton && <CartSkeleton />}

      {showInitialLoadError && (
        <div role="alert" className="mt-8 flex flex-col items-center gap-4 border border-[hsl(228_16%_84%)] bg-[hsl(38_22%_95%)] p-10 text-center">
          <p className="text-[hsl(228_18%_40%)]">تعذّر تحميل السلة. تحقق من اتصالك وحاول مرة أخرى.</p>
          <Button variant="outline" className="rounded-none" onClick={() => refreshCart()}>
            إعادة المحاولة
          </Button>
        </div>
      )}

      {isEmpty && (
        <EmptyState
          className="mt-8"
          icon={<ShoppingBag className="h-8 w-8" strokeWidth={1.3} />}
          title="سلة التسوق فارغة"
          action={
            <Button asChild className="rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]">
              <Link href="/categories">تسوق الآن</Link>
            </Button>
          }
        />
      )}

      {hasLines && cart && (
        <div className="mt-10 grid gap-10 lg:grid-cols-[7fr_4fr] lg:gap-16">
          <ul className="list-none border-t border-[hsl(228_16%_84%)] p-0">
            {cart.items.map((item) => (
              <CartLine
                key={item.id}
                item={item}
                updating={updatingId === item.id}
                onQtyChange={(q) => updateQty(item.id, q)}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </ul>
          <CartSummary itemCount={cart.itemCount} subtotalEgp={cart.subtotalEgp} />
        </div>
      )}

      <RecommendationsRail products={recommendations} />
    </div>
  );
}
