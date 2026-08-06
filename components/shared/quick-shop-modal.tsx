"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/contexts/cart-context";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Price } from "@/components/shared/price";
import { SizeChips } from "@/components/shared/size-chips";
import { ColorSwatches } from "@/components/shared/color-swatches";
import { Button } from "@/components/ui/button";
import { ShoppingCart, X, ExternalLink, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { discountPercentFromPrices } from "@/lib/catalog";
import type { ProductDetail, VariantPublic } from "@/lib/catalog";
import {
  getVariantSizeOptions,
  isKidsCategory,
  normalizeSizeName,
} from "@/lib/size-display";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&h=800&fit=crop";

function variantColorHex(v: VariantPublic): string {
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

function colorKey(v: VariantPublic): string {
  return `${v.colorName ?? ""}|${v.colorHex ?? ""}`;
}

const ARABIC = {
  selectSize: "يرجى اختيار المقاس",
  selectColor: "يجب اختيار اللون",
  outOfStock: "هذا المقاس غير متوفر حالياً",
  added: "تمت الإضافة إلى السلة",
  addToCart: "أضف إلى السلة",
  buyNow: "اشتر الآن",
  color: "اللون",
  size: "المقاس",
  viewProduct: "عرض المنتج",
  save: "وفر",
  error: "حدث خطأ",
};

export interface QuickShopModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productSlug: string | null;
}

export function QuickShopModal({
  open,
  onOpenChange,
  productSlug,
}: QuickShopModalProps) {
  const { toast } = useToast();
  const { openDrawer, refreshCart } = useCart();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [selectedSize, setSelectedSizeState] = useState<string | null>(null);
  const [selectedColorId, setSelectedColorId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const forKids = isKidsCategory(product?.categorySlug);

  const setSelectedSize = useCallback((size: string | null) => {
    setSelectedSizeState(size);
    if (size === null) {
      setSelectedColorId(null);
    } else if (product) {
      const colorKeysForSize = new Set(
        product.variants
          .filter((v) => normalizeSizeName(v.name) === size)
          .map((v) => colorKey(v))
      );
      setSelectedColorId((prev) => (prev && colorKeysForSize.has(prev) ? prev : null));
    }
  }, [product]);

  useEffect(() => {
    if (!open || !productSlug) {
      setProduct(null);
      setSelectedSizeState(null);
      setSelectedColorId(null);
      setQuantity(1);
      return;
    }
    setLoading(true);
    fetch(`/api/products/${encodeURIComponent(productSlug)}`)
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: ProductDetail }) => {
        if (json?.success && json.data) {
          setProduct(json.data);
          setSelectedSizeState(null);
          setSelectedColorId(null);
          setQuantity(1);
        } else {
          setProduct(null);
        }
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [open, productSlug]);

  const sizeOptions = product ? getVariantSizeOptions(product.variants, forKids) : [];

  const variantsForSelectedSize =
    product && selectedSize
      ? product.variants.filter(
          (v) => normalizeSizeName(v.name) === selectedSize
        )
      : [];

  const allColorMap = new Map<string, { name: string; hex: string }>();
  product?.variants.forEach((v) => {
    const key = colorKey(v);
    if (!allColorMap.has(key)) {
      allColorMap.set(key, {
        name: v.colorName?.trim() || v.colorHex || "—",
        hex: variantColorHex(v),
      });
    }
  });
  const colorOptions = Array.from(allColorMap.entries()).map(([id, { name, hex }]) => ({
    id,
    name,
    hex,
    disabled:
      selectedSize === null
        ? !product!.variants.some((v) => colorKey(v) === id && v.inStock)
        : !variantsForSelectedSize.some((v) => colorKey(v) === id && v.inStock),
  }));

  const colorOptionsForSelectedSize =
    selectedSize === null
      ? []
      : colorOptions.filter((opt) =>
          variantsForSelectedSize.some((v) => colorKey(v) === opt.id)
        );

  const selectedVariant =
    selectedSize === null
      ? null
      : colorOptionsForSelectedSize.length > 1
        ? selectedColorId
          ? product?.variants.find(
              (v) =>
                normalizeSizeName(v.name) === selectedSize &&
                colorKey(v) === selectedColorId
            ) ?? null
          : null
        : variantsForSelectedSize[0] ?? null;

  const displayPrice = selectedVariant?.priceEgp ?? product?.priceEgp ?? 0;
  const displayOriginal =
    selectedVariant?.originalPriceEgp != null && selectedVariant.originalPriceEgp > displayPrice
      ? selectedVariant.originalPriceEgp
      : product?.originalPriceEgp != null && product.originalPriceEgp > displayPrice
        ? product.originalPriceEgp
        : undefined;
  const displayDiscountPercent =
    selectedVariant?.discountPercent != null && selectedVariant.originalPriceEgp != null
      ? selectedVariant.discountPercent
      : displayOriginal != null
        ? discountPercentFromPrices(displayOriginal, displayPrice)
        : undefined;
  const savingsEgp =
    displayOriginal != null && displayOriginal > displayPrice
      ? displayOriginal - displayPrice
      : 0;

  const mainImageUrl =
    selectedVariant?.imageUrl?.trim() ||
    (selectedColorId
      ? product?.variants.find((v) => colorKey(v) === selectedColorId)?.imageUrl?.trim()
      : null) ||
    product?.imageUrl?.trim() ||
    PLACEHOLDER_IMAGE;

  const handleAddToCart = async () => {
    if (!product) return;
    if (selectedSize === null) {
      toast({ title: ARABIC.selectSize, variant: "destructive" });
      return;
    }
    if (colorOptionsForSelectedSize.length > 1 && !selectedColorId) {
      toast({ title: ARABIC.selectColor, variant: "destructive" });
      return;
    }
    if (!selectedVariant) {
      toast({ title: ARABIC.selectSize, variant: "destructive" });
      return;
    }
    if (!selectedVariant.inStock) {
      toast({ title: ARABIC.outOfStock, variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: selectedVariant.id, quantity }),
      });
      const json = await res.json();
      if (res.ok) {
        await refreshCart();
        toast({ title: ARABIC.added });
        openDrawer();
        onOpenChange(false);
      } else {
        toast({
          title: json?.error?.message ?? ARABIC.error,
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: ARABIC.error, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const handleBuyNow = async () => {
    if (!product) return;
    if (selectedSize === null) {
      toast({ title: ARABIC.selectSize, variant: "destructive" });
      return;
    }
    if (colorOptionsForSelectedSize.length > 1 && !selectedColorId) {
      toast({ title: ARABIC.selectColor, variant: "destructive" });
      return;
    }
    if (!selectedVariant?.inStock) {
      toast({ title: ARABIC.outOfStock, variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: selectedVariant!.id, quantity }),
      });
      if (res.ok) {
        await refreshCart();
        onOpenChange(false);
        window.location.href = "/cart";
      } else {
        const json = await res.json();
        toast({ title: json?.error?.message ?? ARABIC.error, variant: "destructive" });
      }
    } catch {
      toast({ title: ARABIC.error, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto w-full max-w-md p-0 gap-0 rounded-2xl"
        onClose={() => onOpenChange(false)}
      >
        <DialogHeader className="p-4 pb-0">
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="text-lg font-bold text-foreground text-right flex-1">
              {loading ? "جاري التحميل..." : product?.name ?? ""}
            </DialogTitle>
            <DialogClose asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 rounded-lg shrink-0 bg-amber-500 text-white border-amber-500 hover:bg-amber-600 hover:text-white"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        {loading && (
          <div className="p-8 flex items-center justify-center text-muted-foreground">
            جاري تحميل المنتج...
          </div>
        )}

        {!loading && product && (
          <div className="p-4 pt-3 space-y-4" dir="rtl">
            <div className="flex gap-3">
              <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-xl bg-muted">
                <Image
                  src={mainImageUrl}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="96px"
                />
              </div>
              <div className="flex-1 min-w-0">
                <Price
                  amount={displayPrice}
                  originalAmount={displayOriginal}
                  discountPercent={displayDiscountPercent}
                  size="md"
                  className="flex-wrap"
                />
                {savingsEgp > 0 && (
                  <p className="mt-1 text-xs font-medium text-amber-600">
                    {ARABIC.save} {savingsEgp.toLocaleString("en-US")} ج.م
                  </p>
                )}
              </div>
            </div>

            {product.discountPercent != null && product.discountPercent > 0 && (
              <span className="inline-flex h-8 items-center rounded-lg bg-amber-500/15 px-2 text-xs font-semibold text-amber-700">
                {product.discountPercent}%-
              </span>
            )}

            {colorOptions.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-sm font-semibold text-foreground">
                  {ARABIC.color}
                </h4>
                <ColorSwatches
                  options={colorOptions}
                  value={selectedColorId ?? undefined}
                  onSelect={setSelectedColorId}
                  shape="square"
                />
              </div>
            )}

            {sizeOptions.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-sm font-semibold text-foreground">
                  {ARABIC.size}
                </h4>
                <SizeChips
                  options={sizeOptions}
                  value={selectedSize ?? undefined}
                  onSelect={(id) => setSelectedSize(id)}
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              <div className="flex items-center rounded-xl border border-amber-500/50 bg-background">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-r-xl rounded-l-none"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  aria-label="تقليل"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="min-w-[2rem] text-center text-sm font-medium">
                  {quantity}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-l-xl rounded-r-none"
                  onClick={() => setQuantity((q) => q + 1)}
                  aria-label="زيادة"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Link
                href={`/products/${product.slug}`}
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/50 p-2 text-amber-700 hover:bg-amber-500/10"
                title={ARABIC.viewProduct}
                onClick={() => onOpenChange(false)}
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                className="w-full rounded-xl bg-amber-500 text-white hover:bg-amber-600"
                size="lg"
                onClick={handleAddToCart}
                disabled={!product.inStock || adding}
              >
                <ShoppingCart className="h-5 w-5 ml-2" />
                {ARABIC.addToCart}
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-xl border-foreground/20 bg-foreground text-background hover:bg-foreground/90"
                size="lg"
                onClick={handleBuyNow}
                disabled={!product.inStock || adding}
              >
                {ARABIC.buyNow}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
