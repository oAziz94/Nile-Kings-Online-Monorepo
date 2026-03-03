"use client";

import Link from "next/link";
import Image from "next/image";
import { Price } from "./price";
import { cn } from "@/lib/utils";

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
  className?: string;
}

export function ProductCard({
  id,
  name,
  slug,
  imageUrl,
  price,
  originalPrice,
  discountPercent,
  className,
}: ProductCardProps) {
  const href = `/products/${slug}`;

  return (
    <Link
      href={href}
      className={cn(
        "group relative block overflow-hidden rounded-2xl bg-card p-0 text-card-foreground shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-md",
        className
      )}
    >
      <div className="relative aspect-square overflow-hidden bg-muted rounded-t-2xl">
        <Image
          src={imageUrl || PLACEHOLDER_IMAGE}
          alt={name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="(max-width: 768px) 50vw, 25vw"
        />
        {discountPercent != null && discountPercent > 0 && (
          <span
            className={cn(
              "absolute top-2 right-2 rounded-lg bg-burgundy px-2 py-0.5 text-xs font-medium text-white",
              "left-2 right-auto"
            )}
          >
            -{discountPercent}%
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 text-sm font-medium text-foreground underline-offset-2 decoration-burgundy transition-all group-hover:underline">
          {name}
        </h3>
        <Price
          amount={price}
          originalAmount={originalPrice}
          discountPercent={discountPercent}
          className="mt-2"
        />
      </div>
    </Link>
  );
}
