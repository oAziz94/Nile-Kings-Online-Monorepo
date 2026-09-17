"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/contexts/cart-context";
import { ProductCard } from "@/components/shared/product-card";
import { Price } from "@/components/shared/price";
import { SizeChips } from "@/components/shared/size-chips";
import { ColorSwatches } from "@/components/shared/color-swatches";
import { Disclosure } from "@/components/shared/disclosure";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogClose } from "@/components/ui/dialog";
import {
  ShoppingCart,
  Minus,
  Plus,
  ZoomIn,
  Truck,
  RefreshCw,
  CreditCard,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { discountPercentFromPrices, productCardLabel } from "@/lib/catalog";
import type { VariantPublic } from "@/lib/catalog";
import {
  useVariantSelection,
  VARIANT_SELECTION_MESSAGES,
  colorKey,
} from "@/hooks/use-variant-selection";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=800&h=800&fit=crop";

type Variant = VariantPublic;

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
  /** Colour → ordered photo URLs (backlog: multi-image-per-variant, 2026-09-12). A colour absent
   * here has no gallery yet — the component falls back to its single variant image. */
  variantGalleries?: Record<string, string[]>;
};

type RelatedItem = {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  colorVariants?: { id: string; colorHex: string | null; colorName: string | null; imageUrl: string | null }[];
  variantSlug?: string | null;
  priceEgp: number;
  originalPriceEgp?: number;
  discountPercent?: number;
  inStock: boolean;
  categoryName: string;
  tags?: string[];
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
  const { openDrawer, setCart } = useCart();
  const [adding, setAdding] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const {
    selectedSize,
    selectedColorId,
    setSelectedSize,
    setSelectedColorId,
    sizeOptions,
    colorOptions,
    colorOptionsForSelectedSize,
    selectedVariant,
    displayVariantForImage,
    validate,
  } = useVariantSelection(product.variants, {
    categorySlug: product.categorySlug,
    initialVariantId,
  });

  const displayPrice = selectedVariant?.priceEgp ?? product.priceEgp;
  const displayOriginal =
    selectedVariant?.originalPriceEgp != null && selectedVariant.originalPriceEgp > displayPrice
      ? selectedVariant.originalPriceEgp
      : product.originalPriceEgp != null && product.originalPriceEgp > displayPrice
        ? product.originalPriceEgp
        : undefined;
  const displayDiscountPercent =
    selectedVariant?.discountPercent != null && selectedVariant.originalPriceEgp != null
      ? selectedVariant.discountPercent
      : displayOriginal != null
        ? discountPercentFromPrices(displayOriginal, displayPrice)
        : undefined;

  // Quantity is bounded by the selected variant's real sellable stock when known; otherwise a
  // sane default cap — the API's own maxQty 422 still guards the actual write either way.
  const maxQty = selectedVariant ? Math.max(1, selectedVariant.stockAvailable) : 10;
  useEffect(() => {
    setQuantity((q) => Math.min(Math.max(1, q), maxQty));
  }, [maxQty]);

  const logView = useCallback(() => {
    fetch("/api/analytics/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: product.id,
        variantId: selectedVariant?.id ?? undefined,
        sessionId: typeof window !== "undefined" ? "session-" + Date.now() : undefined,
      }),
    }).catch(() => {});
  }, [product.id, selectedVariant?.id]);

  useEffect(() => {
    logView();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVariant?.id]);

  // Gallery — backlog: multi-image-per-variant (2026-09-12 user idea, verified against the data
  // model). The active colour's full photo set from `VariantImage`, grouped server-side by the
  // same `colorKey` used to group a colour's size rows; a colour with no rows yet falls back to
  // its single `Variant.imageUrl`, then to the product's own image, so unmigrated products are
  // unaffected. The gallery is keyed by COLOUR, not by individual size — sizes of the same colour
  // share one set of photos.
  const activeColorKey = selectedColorId ?? (displayVariantForImage ? colorKey(displayVariantForImage) : null);
  const gallery = useMemo(() => {
    const fromGalleries = activeColorKey ? product.variantGalleries?.[activeColorKey] : undefined;
    if (fromGalleries && fromGalleries.length > 0) return fromGalleries;
    const fallback = displayVariantForImage?.imageUrl?.trim() || product.imageUrl?.trim();
    return [fallback || PLACEHOLDER_IMAGE];
  }, [activeColorKey, product.variantGalleries, product.imageUrl, displayVariantForImage]);

  const [galleryIndex, setGalleryIndex] = useState(0);
  // Selecting a new colour swaps the whole gallery and resets to its first photo (user decision,
  // 2026-09-12) rather than trying to preserve the shopper's position across two different sets.
  useEffect(() => {
    setGalleryIndex(0);
  }, [activeColorKey]);

  const mainImageUrl = gallery[galleryIndex] ?? gallery[0] ?? PLACEHOLDER_IMAGE;

  // Backlog 10.1 — measures the gallery column's real width and the frame's own remaining
  // distance to the viewport bottom, and picks whichever of (fill the column width) / (fit the
  // remaining viewport height) is smaller, so the 4:5 frame is always whole on screen. See the
  // comment above the JSX for why this is JS-measured rather than pure CSS.
  const galleryColumnRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const el = galleryColumnRef.current;
    if (!el) return;
    function recompute() {
      if (!el) return;
      const availableWidth = el.clientWidth;
      if (availableWidth <= 0) return;
      const top = el.getBoundingClientRect().top;
      // A little headroom (16px) so the frame's bottom edge never touches the viewport edge
      // exactly — keeps it comfortably "above the fold", not flush with it.
      const capHeight = Math.max(200, window.innerHeight - top - 16);
      const naturalHeight = availableWidth * 1.25; // 4:5 ratio: height = width * 5/4
      const height = Math.min(naturalHeight, capHeight);
      const width = height * 0.8;
      setFrameSize({ width: Math.round(width), height: Math.round(height) });
    }
    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(el);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, []);

  // A short crossfade on every main-photo change (gallery nav, colour select, hover/focus
  // preview) — `motion-reduce:transition-none` above disables the transition itself for
  // `prefers-reduced-motion`, this just skips the opacity dip so there's no reduced-motion flash.
  const [imageFading, setImageFading] = useState(false);
  const prefersReducedMotionRef = useRef(false);
  useEffect(() => {
    prefersReducedMotionRef.current =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);
  useEffect(() => {
    if (prefersReducedMotionRef.current) return;
    setImageFading(true);
    const id = requestAnimationFrame(() => setImageFading(false));
    return () => cancelAnimationFrame(id);
  }, [mainImageUrl]);

  const handleAdd = async (intent: "cart" | "buy") => {
    const result = validate();
    if (!result.ok) {
      toast({ title: result.message, variant: "destructive" });
      return;
    }
    const v = result.variant;
    setAdding(true);
    try {
      const res = await fetch("/api/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId: v.id, quantity }),
      });
      const json = await res.json();
      if (res.ok) {
        if (json?.data) setCart(json.data);
        fetch("/api/analytics/add-to-cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            variantId: v.id,
            quantity,
            sessionId: typeof window !== "undefined" ? "session-" + Date.now() : undefined,
          }),
        }).catch(() => {});
        if (intent === "buy") {
          window.location.href = "/cart";
          return;
        }
        const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
        if (!isMobile) {
          toast({ title: VARIANT_SELECTION_MESSAGES.added });
        }
        openDrawer();
      } else {
        toast({ title: json?.error?.message ?? "حدث خطأ", variant: "destructive" });
      }
    } catch {
      toast({ title: "حدث خطأ", variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  // The shopper never sees a remaining-stock count (user direction, 2026-09-12); the stepper
  // is still capped by the variant's sellable stock.
  const stockLine = product.inStock ? "متوفر" : "غير متوفر";

  return (
    <>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
        {/* Gallery — backlog 10.1: the main frame keeps the 4:5 ratio but its height is capped so
            the whole photo fits above the fold. A pure-CSS `aspect-ratio` + `max-height` frame
            (tried first) collapses to 0×0 in Chromium here — the frame's only child is a
            `next/image` `fill` <img>, which is absolutely positioned and so contributes no
            intrinsic size, and a grid item with both dimensions "auto" has nothing to derive a
            size from. Instead, `galleryColumnRef` measures the column's real available width and
            the frame's own distance from the viewport bottom (`window.innerHeight - top`, which
            already accounts for the header + page padding above it, however tall they are) and
            sets an explicit pixel width/height from those two numbers directly — the same 4:5
            "cap by whichever of width/height is more restrictive" math, just computed in JS
            instead of relying on the aspect-ratio auto-sizing algorithm. The thumbnail strip caps
            to the same measured height and scrolls vertically once it has more thumbnails than
            fit. */}
        <div className="grid grid-cols-[64px_1fr] items-start gap-3 md:grid-cols-[84px_1fr] md:gap-4">
          <div
            role="list"
            aria-label="صور المنتج"
            className="flex flex-col gap-2.5 overflow-y-auto"
            style={{ maxHeight: frameSize?.height ?? "70dvh" }}
          >
            {gallery.map((url, i) => {
              const active = i === galleryIndex;
              return (
                <button
                  key={`${url}-${i}`}
                  role="listitem"
                  type="button"
                  aria-label={`صورة ${i + 1} من ${gallery.length}`}
                  aria-current={active || undefined}
                  onClick={() => setGalleryIndex(i)}
                  className={cn(
                    "relative aspect-[4/5] w-full shrink-0 overflow-hidden border bg-[hsl(38_22%_93%)]",
                    active ? "border-[hsl(228_40%_14%)]" : "border-[hsl(228_16%_84%)]"
                  )}
                >
                  <Image src={url} alt="" fill className="object-cover" sizes="84px" />
                </button>
              );
            })}
          </div>
          <div ref={galleryColumnRef} className="flex min-w-0 justify-center">
          <div
            data-testid="pdp-main-frame"
            className="relative aspect-[4/5] max-h-[70dvh] overflow-hidden bg-[hsl(38_22%_93%)] lg:max-h-[calc(100dvh-116px)]"
            style={frameSize ? { width: frameSize.width, height: frameSize.height } : undefined}
          >
            <Image
              src={mainImageUrl}
              alt={product.name}
              fill
              className={cn(
                "object-cover transition-opacity duration-150 motion-reduce:transition-none",
                imageFading ? "opacity-0" : "opacity-100"
              )}
              sizes="(max-width: 1024px) 100vw, 50vw"
              priority
              unoptimized={mainImageUrl.startsWith("data:")}
            />
            <button
              type="button"
              aria-label="تكبير الصورة"
              onClick={() => setLightboxOpen(true)}
              className="absolute bottom-4 start-4 grid h-11 w-11 place-items-center border border-[hsl(228_40%_14%)] bg-papyrus text-[hsl(228_40%_14%)] transition-colors hover:bg-[hsl(228_40%_14%)] hover:text-papyrus"
            >
              <ZoomIn className="h-5 w-5" />
            </button>
          </div>
          </div>
        </div>

        {/* Info */}
        <div className="flex flex-col gap-5">
          <Link
            href={`/categories/${product.categorySlug}`}
            className="inline-flex w-fit items-center rounded-full border border-[hsl(228_40%_14%)]/30 px-2.5 py-1 text-xs text-[hsl(228_40%_14%)]"
          >
            {product.categoryName}
          </Link>

          <h1 className="font-amiri text-3xl font-bold leading-tight text-[hsl(228_40%_14%)] md:text-[44px]">
            {product.name}
          </h1>

          <Price
            amount={displayPrice}
            originalAmount={displayOriginal}
            discountPercent={displayDiscountPercent}
            size="lg"
          />

          <div className="flex flex-col gap-2.5 border-y border-[hsl(228_16%_84%)] py-3.5 text-sm leading-6 text-[hsl(228_26%_24%)]">
            <div className="flex items-start gap-2.5">
              <Truck className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span>الشحن يُحسب عند الدفع حسب المحافظة.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <RefreshCw className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span>
                يحق لك طلب الاستبدال أو الاسترجاع خلال 30 يومًا من الاستلام في حال وجود عيب تصنيع؛
                الملابس الداخلية غير قابلة للاسترجاع بعد فتح العبوة لأسباب صحية.{" "}
                <Link href="/terms" className="border-b border-gold-500 text-[hsl(228_40%_14%)]">
                  التفاصيل الكاملة
                </Link>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <CreditCard className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
              <span>الدفع:</span>
              <span className="rounded-full border border-[hsl(228_40%_14%)]/30 px-2.5 py-0.5 text-xs">
                الدفع عند الاستلام
              </span>
              <span className="rounded-full border border-[hsl(228_40%_14%)]/30 px-2.5 py-0.5 text-xs">
                إنستاباي
              </span>
            </div>
          </div>

          {colorOptions.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] text-[hsl(228_18%_50%)]">
                اللون:{" "}
                <span className="text-[hsl(228_40%_14%)]">
                  {colorOptions.find((c) => c.id === selectedColorId)?.name ?? "اختر لونًا"}
                </span>
              </span>
              <ColorSwatches
                options={colorOptions}
                value={selectedColorId ?? undefined}
                onSelect={setSelectedColorId}
                shape="circle"
              />
              {selectedSize !== null && colorOptionsForSelectedSize.length > 1 && !selectedColorId && (
                <p className="text-sm text-destructive">{VARIANT_SELECTION_MESSAGES.selectColor}</p>
              )}
            </div>
          )}

          {sizeOptions.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] text-[hsl(228_18%_50%)]">
                المقاس:{" "}
                <span className="font-archivo text-[hsl(228_40%_14%)]">
                  {sizeOptions.find((s) => s.id === selectedSize)?.label ?? "—"}
                </span>
              </span>
              <SizeChips options={sizeOptions} value={selectedSize ?? undefined} onSelect={setSelectedSize} />
              {selectedSize === null && (
                <p className="text-sm text-[hsl(228_18%_50%)]">{VARIANT_SELECTION_MESSAGES.selectSize}</p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-5">
            <div className="inline-flex h-[52px] items-center border border-[hsl(228_40%_14%)]">
              <button
                type="button"
                aria-label="تقليل الكمية"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="grid h-full w-12 place-items-center text-[hsl(228_40%_14%)] disabled:opacity-40"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span
                aria-live="polite"
                className="grid h-full w-12 place-items-center border-x border-[hsl(228_40%_14%)] font-archivo text-base"
              >
                {quantity}
              </span>
              <button
                type="button"
                aria-label="زيادة الكمية"
                onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                disabled={quantity >= maxQty}
                className="grid h-full w-12 place-items-center text-[hsl(228_40%_14%)] disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            <span className="text-sm text-[hsl(228_26%_24%)]">{stockLine}</span>
          </div>

          <div className="flex flex-col gap-2.5" data-testid="pdp-actions">
            <Button
              className="h-14 w-full rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]"
              onClick={() => handleAdd("cart")}
              disabled={!product.inStock || adding}
            >
              <ShoppingCart className="me-2 h-5 w-5" />
              أضف إلى السلة
            </Button>
            <Button
              variant="outline"
              className="h-14 w-full rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)] hover:bg-[hsl(228_40%_14%)]/5"
              onClick={() => handleAdd("buy")}
              disabled={!product.inStock || adding}
            >
              اشتر الآن
            </Button>
          </div>

          {product.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {product.tags.map((tag) => (
                <Link
                  key={tag}
                  href={`/products?q=${encodeURIComponent(tag)}`}
                  className="rounded-full border border-[hsl(228_40%_14%)]/25 px-3 py-1 text-sm text-[hsl(228_26%_24%)] hover:border-[hsl(228_40%_14%)]"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}

          <div className="border-t border-[hsl(228_16%_84%)]">
            {product.description && (
              <Disclosure title="الوصف" defaultOpen>
                <p className="whitespace-pre-line">{product.description}</p>
              </Disclosure>
            )}
            <Disclosure title="الشحن" defaultOpen={!product.description}>
              <p>الشحن يُحسب عند الدفع حسب المحافظة، وتختلف مدة التوصيل باختلاف المحافظة والعنوان.</p>
            </Disclosure>
            <Disclosure title="الإرجاع">
              <p>
                يحق لك طلب الاستبدال أو الاسترجاع خلال 30 يومًا من الاستلام في حال وجود عيب تصنيع مثبت.
                لا يجوز استبدال أو استرجاع الملابس الداخلية بعد فتح عبوتها أو إزالة أختامها، لأسباب صحية
                وحفاظًا على معايير النظافة والسلامة. راجع{" "}
                <Link href="/terms" className="border-b border-gold-500 text-[hsl(228_40%_14%)]">
                  سياسة الاستبدال والاسترجاع الكاملة
                </Link>
                .
              </p>
            </Disclosure>
            <Disclosure title="الدفع">
              <p>الدفع عند الاستلام، أو عبر إنستاباي.</p>
            </Disclosure>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="rel-h" className="mt-20 border-t border-[hsl(228_16%_84%)] pt-10">
          <h2 id="rel-h" className="mb-7 font-amiri text-2xl font-bold text-[hsl(228_40%_14%)] md:text-[34px]">
            قد يعجبك
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
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
                colorVariants={p.colorVariants}
                variantSlug={p.variantSlug}
                inStock={p.inStock}
                categoryLabel={productCardLabel(p)}
                compact
              />
            ))}
          </div>
        </section>
      )}

      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-3xl overflow-hidden rounded-none border-none bg-transparent p-0 shadow-none">
          <DialogTitle className="sr-only">{product.name}</DialogTitle>
          <div className="relative aspect-[4/5] w-full bg-[hsl(38_22%_93%)]">
            <Image src={mainImageUrl} alt={product.name} fill className="object-contain" sizes="90vw" />
            <DialogClose asChild>
              <button
                type="button"
                aria-label="إغلاق"
                className="absolute end-3 top-3 grid h-10 w-10 place-items-center border border-[hsl(228_40%_14%)] bg-papyrus text-[hsl(228_40%_14%)]"
              >
                <X className="h-5 w-5" />
              </button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
