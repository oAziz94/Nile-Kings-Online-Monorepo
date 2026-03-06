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
  slug?: string | null;
  name: string;
  priceEgp: number;
  stockAvailable: number;
  inStock: boolean;
  colorHex?: string | null;
  colorName?: string | null;
};

const SIZE_ORDER = ["S", "M", "L", "XL", "XXL"];

function sizeSortIndex(name: string): number {
  const i = SIZE_ORDER.indexOf(name.toUpperCase());
  return i === -1 ? SIZE_ORDER.length : i;
}

function variantColorHex(v: Variant): string {
  if (v.colorHex?.trim()) return v.colorHex.trim();
  const name = (v.colorName ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    أسود: "#000000", أبيض: "#ffffff", أحمر: "#b71c1c", أزرق: "#0d47a1",
    أخضر: "#1b5e20", أصفر: "#f9a825", برتقالي: "#e65100", رمادي: "#616161",
    وردي: "#ad1457", بني: "#3e2723", بيج: "#d7ccc8", كحلي: "#0d47a1",
    black: "#000000", white: "#ffffff", red: "#b71c1c", blue: "#0d47a1",
    green: "#1b5e20", yellow: "#f9a825", grey: "#616161", gray: "#616161",
    pink: "#ad1457", brown: "#3e2723", beige: "#d7ccc8", navy: "#0d47a1",
    orange: "#e65100",
  };
  return map[name] ?? "#9e9e9e";
}

function colorKey(v: Variant): string {
  return `${v.colorName ?? ""}|${v.colorHex ?? ""}`;
}

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
  initialVariantId?: string | null;
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
  initialVariantId = null,
}: {
  product: Product;
  related: RelatedItem[];
  initialVariantId?: string | null;
}) {
  const { toast } = useToast();
  const { openDrawer, refreshCart } = useCart();
  const initialVariant = initialVariantId ? product.variants.find((v) => v.id === initialVariantId) : null;
  const [selectedSize, setSelectedSizeState] = useState<string | null>(initialVariant?.name ?? null);
  const [selectedColorId, setSelectedColorId] = useState<string | null>(
    initialVariant ? colorKey(initialVariant) : null
  );
  const [adding, setAdding] = useState(false);

  const setSelectedSize = (size: string | null) => {
    setSelectedSizeState(size);
    setSelectedColorId(null);
  };

  // Always show full size list (smallest → largest, RTL). Disabled when no variant for that size.
  const sizeOptions = SIZE_ORDER.map((name) => ({
    id: name,
    label: name,
    disabled: !product.variants.some((v) => v.name === name && v.inStock),
  }));

  // Colors for the selected size only (squares row). When size changes, colors update.
  const variantsForSelectedSize =
    selectedSize === null
      ? []
      : product.variants.filter((v) => v.name === selectedSize);
  const colorMapForSize = new Map<string, { name: string; hex: string }>();
  variantsForSelectedSize.forEach((v) => {
    const key = colorKey(v);
    if (!colorMapForSize.has(key)) {
      colorMapForSize.set(key, {
        name: v.colorName?.trim() || v.colorHex || "—",
        hex: variantColorHex(v),
      });
    }
  });
  const colorOptions =
    selectedSize === null
      ? []
      : Array.from(colorMapForSize.entries()).map(([id, { name, hex }]) => ({
          id,
          name,
          hex,
          disabled: !variantsForSelectedSize.some(
            (v) => colorKey(v) === id && v.inStock
          ),
        }));

  const selectedVariant =
    selectedSize === null
      ? null
      : colorOptions.length > 1
        ? selectedColorId
          ? product.variants.find(
              (v) =>
                v.name === selectedSize && colorKey(v) === selectedColorId
            ) ?? null
          : null
        : variantsForSelectedSize[0] ?? null;
  const selectedSizeId = selectedVariant?.id ?? null;
  const displayPrice = selectedVariant?.priceEgp ?? product.priceEgp;
  const displayOriginal = selectedVariant
    ? undefined
    : product.originalPriceEgp;
  const displayDiscountPercent = selectedVariant
    ? undefined
    : product.discountPercent;

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
    if (!selectedVariant) {
      toast({
        title: ARABIC_VALIDATION.selectSize,
        variant: "destructive",
      });
      return;
    }
    const v = selectedVariant;
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
        body: JSON.stringify({ variantId: v.id, quantity: 1 }),
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
          variantId: v.id,
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

          <div className="mt-6" dir="rtl">
            <h3 className="mb-2 font-semibold text-foreground">المقاس</h3>
            <SizeChips
              options={sizeOptions}
              value={selectedSize ?? undefined}
              onSelect={(id) => setSelectedSize(id)}
            />
            {!selectedVariant && product.variants.some((v) => v.inStock) && (
              <p className="mt-1 text-sm text-muted-foreground">
                {ARABIC_VALIDATION.selectSize}
              </p>
            )}
          </div>

          <div className="mt-4">
            <h3 className="mb-2 font-semibold text-foreground">اللون</h3>
            {selectedSize === null ? (
              <p className="text-sm text-muted-foreground">اختر المقاس أولاً لعرض الألوان المتاحة</p>
            ) : colorOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد ألوان لهذا المقاس</p>
            ) : (
              <ColorSwatches
                options={colorOptions}
                value={selectedColorId ?? undefined}
                onSelect={setSelectedColorId}
                shape="square"
              />
            )}
          </div>

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
