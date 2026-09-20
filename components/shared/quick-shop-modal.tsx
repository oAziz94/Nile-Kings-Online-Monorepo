"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CatalogImage } from "./catalog-image";
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
import { discountPercentFromPrices } from "@/lib/catalog";
import type { ProductDetail } from "@/lib/catalog";
import { useVariantSelection, VARIANT_SELECTION_MESSAGES } from "@/hooks/use-variant-selection";
import { trackEvent, ga4Item } from "@/lib/analytics/ga4-client";

function ga4VariantLabel(v: { colorName?: string | null; name?: string | null } | null | undefined) {
  if (!v) return undefined;
  const parts = [v.colorName, v.name].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.length > 0 ? parts.join(" / ") : undefined;
}

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&h=800&fit=crop";

const ARABIC = {
  ...VARIANT_SELECTION_MESSAGES,
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
  /**
   * Backlog 4.6: `ProductCard`'s two actions ("أضف إلى السلة" / "اشتر الآن") both open this modal
   * — per standing rule 6, size (and colour, when ambiguous) must always be resolved here before
   * anything is actually added, so neither button can add blind. This prop is purely which footer
   * CTA gets `autoFocus` once the product loads; it does not skip or relax the validation above
   * (`handleAddToCart`/`handleBuyNow` still run their full checks either way).
   */
  initialIntent?: "cart" | "buy";
}

export function QuickShopModal({
  open,
  onOpenChange,
  productSlug,
  initialIntent = "cart",
}: QuickShopModalProps) {
  const { toast } = useToast();
  const { openDrawer, setCart } = useCart();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const {
    selectedSize,
    selectedColorId,
    setSelectedSize,
    setSelectedColorId,
    sizeOptions,
    colorOptions,
    selectedVariant,
    displayVariantForImage,
    validate,
    reset,
  } = useVariantSelection(product?.variants ?? [], { categorySlug: product?.categorySlug });

  useEffect(() => {
    if (!open || !productSlug) {
      setProduct(null);
      setQuantity(1);
      return;
    }
    setLoading(true);
    fetch(`/api/products/${encodeURIComponent(productSlug)}`)
      .then((res) => res.json())
      .then((json: { success?: boolean; data?: ProductDetail }) => {
        if (json?.success && json.data) {
          setProduct(json.data);
          setQuantity(1);
        } else {
          setProduct(null);
        }
      })
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [open, productSlug]);

  // Reset the selection whenever the underlying product identity changes (new product loaded,
  // or the modal closed) — mirrors the legacy behaviour of resetting on every open/product fetch.
  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id]);

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

  const mainImageUrl = displayVariantForImage?.imageUrl?.trim() || product?.imageUrl?.trim() || PLACEHOLDER_IMAGE;

  const trackAddToCart = (v: { sku: string; priceEgp: number; colorName?: string | null; name?: string | null }, qty: number) => {
    if (!product) return;
    trackEvent("add_to_cart", {
      currency: "EGP",
      value: v.priceEgp * qty,
      items: [
        ga4Item({
          sku: v.sku,
          name: product.name,
          category: product.categoryName,
          variant: ga4VariantLabel(v),
          priceEgp: v.priceEgp,
          quantity: qty,
        }),
      ],
    });
  };

  const handleAddToCart = async () => {
    if (!product) return;
    const result = validate();
    if (!result.ok) {
      toast({ title: result.message, variant: "destructive" });
      return;
    }
    const selectedVariant = result.variant;
    setAdding(true);
    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: selectedVariant.id, quantity }),
      });
      const json = await res.json();
      if (res.ok) {
        if (json?.data) setCart(json.data);
        trackAddToCart(selectedVariant, quantity);
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
    const result = validate();
    if (!result.ok) {
      toast({ title: result.message, variant: "destructive" });
      return;
    }
    const selectedVariant = result.variant;
    setAdding(true);
    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: selectedVariant.id, quantity }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) setCart(json.data);
        trackAddToCart(selectedVariant, quantity);
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
      <DialogContent className="max-h-[90vh] w-full max-w-md gap-0 overflow-y-auto rounded-none p-0">
        <DialogHeader className="p-4 pb-0">
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="flex-1 text-right font-amiri text-lg font-bold text-[hsl(228_40%_14%)]">
              {loading ? "جاري التحميل..." : product?.name ?? ""}
            </DialogTitle>
            <DialogClose asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-none border-[hsl(228_40%_14%)] bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]"
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
          <div className="space-y-4 p-4 pt-3" dir="rtl">
            <div className="flex gap-3">
              <div className="relative aspect-[4/5] w-24 shrink-0 overflow-hidden bg-[hsl(38_22%_93%)]">
                <CatalogImage
                  src={mainImageUrl}
                  alt={product.name}
                  fill
                  fit="balanced"
                  sizes="96px"
                />
              </div>
              <div className="min-w-0 flex-1">
                <Price
                  amount={displayPrice}
                  originalAmount={displayOriginal}
                  discountPercent={displayDiscountPercent}
                  size="md"
                  className="flex-wrap"
                />
                {savingsEgp > 0 && (
                  <p className="mt-1 text-xs font-medium text-gold-600">
                    {ARABIC.save} {savingsEgp.toLocaleString("en-US")} ج.م
                  </p>
                )}
              </div>
            </div>

            {colorOptions.length > 0 && (
              <div>
                <h4 className="mb-1.5 text-sm font-semibold text-[hsl(228_40%_14%)]">
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
                <h4 className="mb-1.5 text-sm font-semibold text-[hsl(228_40%_14%)]">
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
              <div className="flex items-center border border-[hsl(228_40%_14%)]">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-none"
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
                  className="h-9 w-9 rounded-none"
                  onClick={() => setQuantity((q) => q + 1)}
                  aria-label="زيادة"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <Link
                href={`/products/${product.slug}`}
                className="inline-flex items-center gap-1 border border-[hsl(228_40%_14%)]/40 p-2 text-[hsl(228_40%_14%)] hover:bg-[hsl(228_40%_14%)]/5"
                title={ARABIC.viewProduct}
                onClick={() => onOpenChange(false)}
              >
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <Button
                className="w-full rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]"
                size="lg"
                onClick={handleAddToCart}
                disabled={!product.inStock || adding}
                autoFocus={initialIntent === "cart"}
              >
                <ShoppingCart className="h-5 w-5 ml-2" />
                {ARABIC.addToCart}
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)] hover:bg-[hsl(228_40%_14%)]/5"
                size="lg"
                onClick={handleBuyNow}
                disabled={!product.inStock || adding}
                autoFocus={initialIntent === "buy"}
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
