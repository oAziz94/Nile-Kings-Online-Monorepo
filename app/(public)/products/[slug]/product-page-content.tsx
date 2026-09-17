"use client";

import { useEffect, useMemo, useRef, useState, useCallback, type MouseEvent } from "react";
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
import { ShoppingCart, Minus, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { colorSwatchPreviewImage, discountPercentFromPrices, productCardLabel } from "@/lib/catalog";
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
    colorOptions,
    colorOptionsForSelectedSize,
    sizeOptionsForSelectedColor,
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

  // Backlog 10.2 — hovering/focusing a colour swatch previews that colour's representative photo
  // in the main frame only (not the thumbnail strip, not the selected size/price), same semantics
  // as the storefront card's colour-dot hover swap; a colour with no photo of its own (the shared
  // `colorSwatchPreviewImage` lookup returns null) previews nothing, the frame stays as it is.
  const colorPreviewImages = useMemo(() => {
    const map: Record<string, string | null> = {};
    for (const v of product.variants) {
      const key = colorKey(v);
      if (key in map) continue;
      const galleryFirst = product.variantGalleries?.[key]?.[0];
      map[key] = colorSwatchPreviewImage(galleryFirst ?? v.imageUrl);
    }
    return map;
  }, [product.variants, product.variantGalleries]);

  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const previewColor = useCallback(
    (id: string) => {
      const img = colorPreviewImages[id];
      if (img) setPreviewImageUrl(img);
    },
    [colorPreviewImages]
  );
  const clearColorPreview = useCallback(() => setPreviewImageUrl(null), []);
  // A real selection (click, or any other reason the active gallery changes) always wins over a
  // stale hover/focus preview.
  useEffect(() => {
    setPreviewImageUrl(null);
  }, [activeColorKey, galleryIndex]);

  const mainImageUrl = previewImageUrl ?? gallery[galleryIndex] ?? gallery[0] ?? PLACEHOLDER_IMAGE;

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

  // Backlog 10.3 — the magnifier and the desktop lightbox are gone; entering the frame with a
  // mouse/trackpad (`hover: hover` and `pointer: fine`) magnifies the whole photo 2x, panning
  // with the cursor. Touch devices (`hover: none`) keep tap-to-open the full-screen lightbox
  // instead — it is their only way to see the whole photo, since there is no hover to zoom with.
  const [isTouchPointer, setIsTouchPointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(hover: none), (pointer: coarse)");
    const update = () => setIsTouchPointer(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const [zoomActive, setZoomActive] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });

  const handleFrameMouseEnter = useCallback(() => {
    if (!isTouchPointer) setZoomActive(true);
  }, [isTouchPointer]);
  const handleFrameMouseLeave = useCallback(() => setZoomActive(false), []);
  const handleFrameMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (isTouchPointer) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      setZoomPos({ x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) });
    },
    [isTouchPointer]
  );
  const handleFrameClick = useCallback(() => {
    if (isTouchPointer) setLightboxOpen(true);
  }, [isTouchPointer]);

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

  // Backlog 10.4 — an out-of-stock colour can now be selected (10.2's preview + a real click);
  // only buying is blocked. Tied to the COLOUR selection itself (not the fully-resolved variant)
  // so the message/disabling appears the moment the colour is chosen, even before a size is —
  // matches the owner's framing ("selecting an out-of-stock colour ... disables the buttons").
  const selectedColorOption = colorOptions.find((c) => c.id === selectedColorId);
  const selectedColorUnavailable = selectedColorOption?.disabled === true;
  const colorUnavailableMessageId = "pdp-color-unavailable-message";

  return (
    <>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
        {/* Gallery — backlog 10.1/10.3/10.5: the main frame's height is capped so the whole photo
            fits above the fold. 10.5 returns the ratio to the photo's own 4:5 (portrait, whole
            photo, no crop — supersedes 10.3's 5:4 landscape crop; the owner disliked the crop on
            seeing v2.4.2). `aspect-ratio` + `max-height` alone collapses the frame to 0×0 here (its
            width is auto inside a centred flex wrapper, so the browser has two free axes and
            nothing to derive either from — the frame's only child is a `next/image` `fill` <img>,
            absolutely positioned, contributing no intrinsic size either). Capping the WIDTH from
            the height instead gives it exactly one free axis: `max-width: (height cap) * 4/5`,
            `aspect-ratio: 4/5` derives the height from that width, `w-full` lets it fill up to
            that cap. Pure CSS, no measurement — this is why it renders correctly on first paint
            (no SSR-then-hydration jump). The thumbnail strip is unchanged (still 4:5, still capped
            to the same height expression, still scrolling vertically past its fit). */}
        <div className="grid grid-cols-[64px_1fr] items-start gap-3 md:grid-cols-[84px_1fr] md:gap-4">
          <div
            role="list"
            aria-label="صور المنتج"
            className="flex max-h-[70dvh] flex-col gap-2.5 overflow-y-auto lg:max-h-[calc(100dvh-116px)]"
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
          <div className="flex min-w-0 justify-center">
          <div
            data-testid="pdp-main-frame"
            onMouseEnter={handleFrameMouseEnter}
            onMouseMove={handleFrameMouseMove}
            onMouseLeave={handleFrameMouseLeave}
            onClick={handleFrameClick}
            className={cn(
              "relative aspect-[4/5] w-full max-w-[calc(70dvh*0.8)] overflow-hidden bg-[hsl(38_22%_93%)] lg:max-w-[calc((100dvh-116px)*0.8)]",
              isTouchPointer && "cursor-pointer"
            )}
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
            {/* Backlog 10.3, unchanged by 10.5 — desktop-only 2x zoom, the magnified region
                tracking the cursor. The zoom base is the whole photo (10.5: now the same 4:5 the
                frame itself shows, since the frame crops nothing any more), so panning toward an
                edge still pans the zoom normally; leaving the frame restores the plain view. Pointer-only,
                never focusable, so nothing keyboard-reachable before is lost — see the hidden
                "عرض الصورة كاملة" control below for the keyboard/screen-reader path. */}
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-0 bg-no-repeat opacity-0 transition-opacity duration-150 motion-reduce:transition-none",
                zoomActive && !isTouchPointer && "opacity-100"
              )}
              style={{
                backgroundImage: `url(${mainImageUrl})`,
                backgroundSize: "200%",
                backgroundPosition: `${zoomPos.x}% ${zoomPos.y}%`,
              }}
            />
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setLightboxOpen(true);
              }}
              className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:bottom-4 focus-visible:start-4 focus-visible:z-10 focus-visible:grid focus-visible:h-11 focus-visible:w-11 focus-visible:place-items-center focus-visible:border focus-visible:border-[hsl(228_40%_14%)] focus-visible:bg-papyrus focus-visible:text-[hsl(228_40%_14%)]"
            >
              عرض الصورة كاملة
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
                onPreview={previewColor}
                onPreviewEnd={clearColorPreview}
                shape="circle"
                allowSelectingDisabled
              />
              {selectedSize !== null && colorOptionsForSelectedSize.length > 1 && !selectedColorId && (
                <p className="max-w-[60ch] text-sm text-destructive">{VARIANT_SELECTION_MESSAGES.selectColor}</p>
              )}
            </div>
          )}

          {sizeOptionsForSelectedColor.length > 0 && (
            <div className="flex flex-col gap-2.5">
              <span className="text-[13px] text-[hsl(228_18%_50%)]">
                المقاس:{" "}
                <span className="font-archivo text-[hsl(228_40%_14%)]">
                  {sizeOptionsForSelectedColor.find((s) => s.id === selectedSize)?.label ?? "—"}
                </span>
              </span>
              <SizeChips
                options={sizeOptionsForSelectedColor}
                value={selectedSize ?? undefined}
                onSelect={setSelectedSize}
              />
              {selectedSize === null && (
                <p className="max-w-[60ch] text-sm text-[hsl(228_18%_50%)]">{VARIANT_SELECTION_MESSAGES.selectSize}</p>
              )}
            </div>
          )}

          {!selectedColorUnavailable && (
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
          )}

          <div className="flex flex-col gap-2.5" data-testid="pdp-actions">
            <Button
              className="h-14 w-full rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]"
              onClick={() => handleAdd("cart")}
              disabled={!product.inStock || adding || selectedColorUnavailable}
              aria-describedby={selectedColorUnavailable ? colorUnavailableMessageId : undefined}
            >
              <ShoppingCart className="me-2 h-5 w-5" />
              أضف إلى السلة
            </Button>
            <Button
              variant="outline"
              className="h-14 w-full rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)] hover:bg-[hsl(228_40%_14%)]/5"
              onClick={() => handleAdd("buy")}
              disabled={!product.inStock || adding || selectedColorUnavailable}
              aria-describedby={selectedColorUnavailable ? colorUnavailableMessageId : undefined}
            >
              اشتر الآن
            </Button>
            {selectedColorUnavailable && (
              <p id={colorUnavailableMessageId} className="max-w-[60ch] text-sm text-destructive">
                هذا اللون غير متوفر حالياً
              </p>
            )}
          </div>

          {/* Backlog 10.5 — the accordion (previously under the gallery) moves into the buy-box
              column, directly under the add-to-cart/buy-now buttons (and the unavailable-colour
              message when shown), using the column's leftover space below the buttons; it also
              now carries the three facts the removed info-line block used to state (shipping is
              calculated at checkout by governorate, the 30-day returns terms + full policy link,
              and the two payment methods) — each already lived in one of these panels. */}
          <div className="border-t border-[hsl(228_16%_84%)]">
            {product.description && (
              <Disclosure title="الوصف" defaultOpen>
                <p className="max-w-[60ch] whitespace-pre-line">{product.description}</p>
              </Disclosure>
            )}
            <Disclosure title="الشحن" defaultOpen={!product.description}>
              <p className="max-w-[60ch]">
                الشحن يُحسب عند الدفع حسب المحافظة، وتختلف مدة التوصيل باختلاف المحافظة والعنوان.
              </p>
            </Disclosure>
            <Disclosure title="الإرجاع">
              <p className="max-w-[60ch]">
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
              <div className="flex max-w-[60ch] flex-col gap-2.5">
                <p>الدفع عند الاستلام، أو عبر إنستاباي.</p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="rounded-full border border-[hsl(228_40%_14%)]/30 px-2.5 py-0.5 text-xs">
                    الدفع عند الاستلام
                  </span>
                  <span className="rounded-full border border-[hsl(228_40%_14%)]/30 px-2.5 py-0.5 text-xs">
                    إنستاباي
                  </span>
                </div>
              </div>
            </Disclosure>
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
