import Link from "next/link";
import { CatalogImage } from "@/components/shared/catalog-image";
import { Price } from "@/components/shared/price";
import { friendlyVariantLabel } from "@/lib/cart/variant-label";
import type { CartItem } from "@/contexts/cart-context";

const PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=200&h=200&fit=crop";

/**
 * Backlog 4.12: shows *every* cart line, not the old first-6 cutoff (a gap, not a preserved
 * behaviour — `04-decisions.md` 2026-09-12).
 */
export function OrderReview({ items }: { items: CartItem[] }) {
  return (
    <ul className="mt-5 list-none divide-y divide-[hsl(228_16%_84%)] border-t border-[hsl(228_16%_84%)] p-0">
      {items.map((item) => {
        const href = `/products/${item.variantSlug ?? item.productSlug}`;
        return (
          <li key={item.id} className="flex gap-3 py-4">
            <Link
              href={href}
              className="relative block aspect-[4/5] h-14 w-14 shrink-0 overflow-hidden bg-[hsl(38_22%_93%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
            >
              <CatalogImage
                src={item.imageUrl || PLACEHOLDER_IMAGE}
                alt={item.productName}
                fill
                className="object-cover"
                sizes="56px"
              />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={href} className="font-amiri text-base text-[hsl(228_40%_14%)] hover:underline">
                {item.productName}
              </Link>
              <p className="mt-0.5 text-sm text-[hsl(228_18%_45%)]">
                {friendlyVariantLabel(item)} ×{" "}
                <span className="font-archivo" style={{ direction: "ltr" }}>
                  {item.quantity.toLocaleString("en-US")}
                </span>
              </p>
            </div>
            <Price amount={item.priceEgp * item.quantity} size="sm" className="shrink-0" />
          </li>
        );
      })}
    </ul>
  );
}
