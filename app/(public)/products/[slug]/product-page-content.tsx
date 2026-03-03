"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/contexts/cart-context";
import { ProductCard } from "@/components/shared/product-card";
import { Price } from "@/components/shared/price";
import { SizeChips } from "@/components/shared/size-chips";
import { ColorSwatches } from "@/components/shared/color-swatches";
import { Button } from "@/components/ui/button";
import { ChevronRight, ShoppingCart, Package } from "lucide-react";
import { cn } from "@/lib/utils";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&h=800&fit=crop";

type Variant = {
  id: string;
  sku: string;
  name: string;
  priceEgp: number;
  stockAvailable: number;
  inStock: boolean;
};

type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  tags: string[];
  categorySlug: string;
  categoryName: string;
  priceEgp: number;
  originalPriceEgp?: number;
  discountPercent?: number;
  inStock: boolean;
  variants: Variant[];
};

type RelatedItem = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  priceEgp: number;
  originalPriceEgp?: number;
  discountPercent?: number;
  inStock: boolean;
};

const ARABIC_VALIDATION = {
  selectSize: "يرجى اختيار المقاس",
  outOfStock: "هذا المقاس غير متوفر حالياً",
  added: "تمت الإضافة إلى السلة",
};

export function ProductPageContent({
  product,
  related,
}: {
  product: Product;
  related: RelatedItem[];
}) {
  const { toast } = useToast();
  const { openDrawer, refreshCart } = useCart();
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
  const [colorId, setColorId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const selectedVariant = product.variants.find((v) => v.id === selectedSizeId);
  const displayPrice = selectedVariant?.priceEgp ?? product.priceEgp;
  const displayOriginal = selectedVariant
    ? undefined
    : product.originalPriceEgp;
  const displayDiscountPercent = selectedVariant
    ? undefined
    : product.discountPercent;

  const sizeOptions = product.variants.map((v) => ({
    id: v.id,
    label: v.name,
    disabled: !v.inStock,
  }));

  const colorOptions: { id: string; name: string; hex: string; disabled?: boolean }[] = [];

  const logView = useCallback(() => {
    fetch("/api/analytics/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        variantId: selectedSizeId ?? undefined,
        sessionId: typeof window !== "undefined" ? "session-" + Date.now() : undefined,
      }),
    }).catch(() => {});
  }, [product.id, selectedSizeId]);

  useEffect(() => {
    logView();
  }, [logView]);

  const handleAddToCart = async () => {
    if (!selectedSizeId) {
      toast({
        title: ARABIC_VALIDATION.selectSize,
        variant: "destructive",
      });
      return;
    }
    const v = product.variants.find((x) => x.id === selectedSizeId);
    if (v && !v.inStock) {
      toast({
        title: ARABIC_VALIDATION.outOfStock,
        variant: "destructive",
      });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: selectedSizeId, quantity: 1 }),
      });
      const json = await res.json();
      if (res.ok) {
        await refreshCart();
        toast({ title: ARABIC_VALIDATION.added });
        openDrawer();
      } else {
        toast({
          title: json?.error?.message ?? "حدث خطأ",
          variant: "destructive",
        });
      }
      // Analytics: log add-to-cart
      fetch("/api/analytics/add-to-cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variantId: selectedSizeId,
          quantity: 1,
          sessionId: typeof window !== "undefined" ? "session-" + Date.now() : undefined,
        }),
      }).catch(() => {});
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const galleryImages = product.imageUrl
    ? [product.imageUrl]
    : [PLACEHOLDER_IMAGE];

  return (
    <>
      <nav className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          الرئيسية
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link href={`/categories/${product.categorySlug}`} className="hover:text-foreground">
          {product.categoryName}
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">{product.name}</span>
      </nav>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
          <Image
            src={galleryImages[0]}
            alt={product.name}
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 50vw"
            priority
          />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-foreground md:text-3xl">
            {product.name}
          </h1>

          <Price
            amount={displayPrice}
            originalAmount={displayOriginal}
            discountPercent={displayDiscountPercent}
            size="lg"
            className="mt-4"
          />

          {product.description && (
            <p className="mt-4 text-muted-foreground">{product.description}</p>
          )}

          <div className="mt-6">
            <h3 className="mb-2 font-semibold text-foreground">المقاس</h3>
            <SizeChips
              options={sizeOptions}
              value={selectedSizeId ?? undefined}
              onSelect={setSelectedSizeId}
            />
            {!selectedSizeId && product.variants.some((v) => v.inStock) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {ARABIC_VALIDATION.selectSize}
              </p>
            )}
          </div>

          {colorOptions.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 font-semibold text-foreground">اللون</h3>
              <ColorSwatches
                options={colorOptions}
                value={colorId ?? undefined}
                onSelect={setColorId}
              />
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <span
              className={cn(
                "text-sm font-medium",
                product.inStock ? "text-green-600" : "text-destructive"
              )}
            >
              {product.inStock ? "متوفر" : "غير متوفر"}
            </span>
            {selectedVariant && (
              <span className="text-sm text-muted-foreground">
                ({selectedVariant.stockAvailable} قطعة)
              </span>
            )}
          </div>

          <Button
            className="mt-6 w-full rounded-2xl md:w-auto"
            size="lg"
            onClick={handleAddToCart}
            disabled={!product.inStock || adding}
          >
            <ShoppingCart className="h-5 w-5 ml-2" />
            أضف إلى السلة
          </Button>

          {product.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {product.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/search?q=${encodeURIComponent(tag)}`}
                  className="rounded-xl bg-muted px-3 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-foreground">
            <Package className="h-5 w-5" />
            منتجات ذات صلة
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {related.map((p) => (
              <ProductCard
                key={p.id}
                id={p.id}
                name={p.name}
                slug={p.slug}
                imageUrl={p.imageUrl}
                price={p.priceEgp}
                originalPrice={p.originalPriceEgp}
                discountPercent={p.discountPercent}
              />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
