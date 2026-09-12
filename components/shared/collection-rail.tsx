"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ProductCard } from "@/components/shared/product-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Package } from "lucide-react";
import { productCardLabel, type ProductListItem } from "@/lib/catalog";

const DESKTOP_QUERY = "(min-width: 1024px)";

function toCardProps(p: ProductListItem, compact: boolean) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    imageUrl: p.imageUrl,
    price: p.priceEgp,
    originalPrice: p.originalPriceEgp,
    discountPercent: p.discountPercent,
    colorVariants: p.colorVariants,
    variantSlug: p.variantSlug,
    inStock: p.inStock ?? true,
    categoryLabel: productCardLabel(p),
    compact,
  };
}

interface CollectionRailProps {
  id: string;
  title: string;
  viewAllHref: string;
  prevLabel: string;
  nextLabel: string;
  products: ProductListItem[];
}

/**
 * Fixed horizontal collection rail — backlog 4.7, replaces `RotatingProductGrid`'s 6s
 * auto-rotation entirely (deleted, per `03-backlog.md` 4.7). Scroll-snap row, keyboard-scrollable
 * (native — the scroller itself is focusable/arrow-key-scrollable in every evergreen browser),
 * prev/next buttons hidden when the collection has 4 or fewer items. Title links to the category,
 * same as the pre-redesign `CollectionCarouselSection`.
 *
 * RTL scroll direction: this scroller lives inside an RTL ancestor (`dir="rtl"` on the page). Per
 * the CSSOM View spec, browsers that implement the "negative" scrollLeft model for `dir:rtl`
 * containers (Chrome/Firefox/Safari, current versions) start at `scrollLeft = 0` at the visual
 * *start* (right edge) and go more negative as the view moves toward later items (physically
 * left) — so "next" (advance to later items) is `scrollBy({ left: -delta })` and "prev" is
 * `scrollBy({ left: +delta })`. Verified visually at real viewports, not just assumed from spec text.
 */
export function CollectionRail({ id, title, viewAllHref, prevLabel, nextLabel, products }: CollectionRailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const update = () => setCompact(!mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  if (products.length === 0) {
    return (
      <section aria-labelledby={id} className="px-4 py-10 sm:px-6 md:py-12 lg:px-12 lg:py-14">
        <h2 id={id} className="mb-6 font-amiri text-2xl font-bold text-[hsl(228_40%_14%)] lg:text-[34px]">
          <Link href={viewAllHref} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">
            {title}
          </Link>
        </h2>
        <EmptyState
          icon={<Package className="h-8 w-8" />}
          title="لا توجد منتجات في هذا الكولكشن"
          description="تصفح التصنيفات الأخرى."
        />
      </section>
    );
  }

  const showControls = products.length > 4;
  const itemWidth = compact ? 200 : 312;

  function scrollByDirection(dir: "next" | "prev") {
    const el = scrollerRef.current;
    if (!el) return;
    const delta = itemWidth + 24;
    el.scrollBy({ left: dir === "next" ? -delta : delta, behavior: "smooth" });
  }

  return (
    <section aria-labelledby={id} className="py-10 md:py-12 lg:py-14">
      <div className="mb-6 flex items-center justify-between px-4 sm:px-6 lg:px-12">
        <h2 id={id} className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)] lg:text-[34px]">
          <Link href={viewAllHref} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500">
            {title}
          </Link>
        </h2>
        {showControls && (
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={prevLabel}
              onClick={() => scrollByDirection("prev")}
              className="grid h-11 w-11 place-items-center border border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)] transition-colors hover:bg-[hsl(228_40%_14%)]/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={nextLabel}
              onClick={() => scrollByDirection("next")}
              className="grid h-11 w-11 place-items-center border border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)] transition-colors hover:bg-[hsl(228_40%_14%)]/6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                <path d="M15 6l-6 6 6 6" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <div
        ref={scrollerRef}
        tabIndex={0}
        role="group"
        aria-label={title}
        className="flex gap-3 overflow-x-auto px-4 pb-2 [scroll-snap-type:x_mandatory] [scrollbar-width:none] sm:px-6 lg:gap-6 lg:px-12 [&::-webkit-scrollbar]:hidden"
      >
        {products.map((p) => (
          <div key={p.id} className="w-[200px] shrink-0 [scroll-snap-align:start] lg:w-[312px]">
            <ProductCard {...toCardProps(p, compact)} className="h-full" />
          </div>
        ))}
      </div>
    </section>
  );
}
