"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Price } from "./price";
import { QuickShopModal } from "./quick-shop-modal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ColorVariantListItem } from "@/lib/catalog";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400&h=400&fit=crop";

export interface ProductCardProps {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  price: number;
  originalPrice?: number;
  discountPercent?: number;
  /** Color variants for swatches; hovering a swatch switches the product image. */
  colorVariants?: ColorVariantListItem[];
  /** When set (section view), link to this variant slug so the product page opens with that variant selected. */
  variantSlug?: string | null;
  /** When false, show a sold-out badge. Omitted or true = in stock. */
  inStock?: boolean;
  className?: string;
  /** Tighter spacing/type for the 2-column phone grid. */
  compact?: boolean;
  /** Category chip (top-inline-start on the image) — rendered only when given. */
  categoryLabel?: string;
}

/**
 * ProductCard v2 — backlog 4.6, per `category-listing-desktop-1.png`/`-mobile-1.png`: 4:5 image,
 * category chip top-inline-start, discount pill top-inline-end, name in Amiri, restyled `Price`,
 * colour dots (hover swap / click deep-link preserved from v1), and the two canvas actions —
 * "أضف إلى السلة" (ink) / "اشتر الآن" (outline) — both open `QuickShopModal` so size/colour is
 * always resolved before anything is actually added (standing rule 6: never add blind). No hover
 * overlay, no wishlist heart (deferred, `04-decisions.md` 2026-09-12 decision 2).
 */
export function ProductCard({
  name,
  slug,
  imageUrl,
  price,
  originalPrice,
  discountPercent,
  colorVariants,
  variantSlug,
  inStock = true,
  className,
  compact = false,
  categoryLabel,
}: ProductCardProps) {
  const [hoveredImageUrl, setHoveredImageUrl] = useState<string | null>(null);
  const [quickShopOpen, setQuickShopOpen] = useState(false);
  const [intent, setIntent] = useState<"cart" | "buy">("cart");
  const href = variantSlug ? `/products/${variantSlug}` : `/products/${slug}`;
  const displayImage = hoveredImageUrl ?? imageUrl ?? PLACEHOLDER_IMAGE;

  function openQuickShop(nextIntent: "cart" | "buy") {
    setIntent(nextIntent);
    setQuickShopOpen(true);
  }

  return (
    <>
      <div
        className={cn(
          "group flex flex-col overflow-hidden border border-[hsl(228_16%_88%)] bg-papyrus text-[hsl(228_26%_24%)]",
          className
        )}
      >
        <Link
          href={href}
          className="relative block aspect-[4/5] overflow-hidden bg-[hsl(38_22%_93%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2"
        >
          <Image
            src={displayImage}
            alt={name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 50vw, 25vw"
          />
          {categoryLabel && (
            <span className="absolute start-2 top-2 bg-papyrus px-2 py-1 text-[11px] font-medium text-[hsl(228_26%_24%)]">
              {categoryLabel}
            </span>
          )}
          {discountPercent != null && discountPercent > 0 && (
            <span
              className="absolute end-2 top-2 bg-[hsl(228_40%_14%)] px-2 py-1 font-archivo text-[11px] font-semibold text-papyrus"
              style={{ direction: "ltr" }}
            >
              -{discountPercent}%
            </span>
          )}
          {!inStock && (
            <span className="absolute end-2 top-2 bg-[hsl(228_40%_14%)] px-2 py-1 text-[11px] font-medium text-papyrus">
              نفذ
            </span>
          )}
        </Link>

        <div className={cn("flex flex-1 flex-col", compact ? "gap-2 p-3" : "gap-2.5 p-4")}>
          <Link href={href} className="block">
            <h3
              className={cn(
                "line-clamp-2 font-amiri font-bold text-[hsl(228_40%_14%)] underline-offset-2 group-hover:underline",
                compact ? "text-sm" : "text-base"
              )}
            >
              {name}
            </h3>
            <Price
              amount={price}
              originalAmount={originalPrice}
              discountPercent={discountPercent}
              size={compact ? "sm" : "md"}
              className="mt-1.5"
            />
          </Link>

          {colorVariants != null && colorVariants.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="list" aria-label="ألوان متاحة">
              {colorVariants.map((c) => {
                const hex = c.colorHex ?? "#e5e7eb";
                const variantImage = c.imageUrl ?? imageUrl ?? PLACEHOLDER_IMAGE;
                return (
                  // Hover/focus swaps the card's image to this colour (preserved from v1); there
                  // is no per-colour variant slug on `ColorVariantListItem` (lib/catalog.ts is
                  // out of scope for this task) so, same as v1, the dot itself doesn't navigate —
                  // the card's own link (`variantSlug`/`slug`) is the only navigation target.
                  <span
                    key={c.id}
                    role="listitem"
                    title={c.colorName ?? undefined}
                    tabIndex={0}
                    aria-label={c.colorName ? `اللون ${c.colorName}` : "لون آخر"}
                    className="h-4 w-4 shrink-0 rounded-full border border-[hsl(228_16%_78%)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-1"
                    style={{ backgroundColor: hex }}
                    onMouseEnter={() => setHoveredImageUrl(variantImage)}
                    onMouseLeave={() => setHoveredImageUrl(null)}
                    onFocus={() => setHoveredImageUrl(variantImage)}
                    onBlur={() => setHoveredImageUrl(null)}
                  />
                );
              })}
            </div>
          )}

          <div className={cn("mt-auto flex gap-2 pt-1", compact && "flex-col")}>
            <Button
              type="button"
              size={compact ? "sm" : "default"}
              disabled={!inStock}
              onClick={() => openQuickShop("cart")}
              className="flex-1 rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)] disabled:opacity-50"
            >
              {inStock ? "أضف إلى السلة" : "نفذ"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size={compact ? "sm" : "default"}
              disabled={!inStock}
              onClick={() => openQuickShop("buy")}
              className="flex-1 rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)] hover:bg-[hsl(228_40%_14%)]/5 disabled:opacity-50"
            >
              اشتر الآن
            </Button>
          </div>
        </div>
      </div>

      <QuickShopModal
        open={quickShopOpen}
        onOpenChange={setQuickShopOpen}
        productSlug={quickShopOpen ? slug : null}
        initialIntent={intent}
      />
    </>
  );
}
