import { useState, type SyntheticEvent } from "react";
import Image, { type ImageProps } from "next/image";
import { cloudinaryLoader } from "@/lib/images/cloudinary-loader";
import { cn } from "@/lib/utils";

export interface CatalogImageProps extends ImageProps {
  /**
   * Backlog 10.20 — real catalog photos are a mix of shapes (measured: 47% tall portrait, 31%
   * landscape, 21% ~4:5) but every frame is a fixed 4:5 so the grid never jumps. Default `"cover"`
   * keeps today's behaviour (portrait photos already fill the frame correctly). `"contain"` shows
   * the whole photo on the papyrus background — used on the PDP where there's room. `"auto"`
   * starts as `"cover"` and switches to `"contain"` once the real image loads and turns out to be
   * landscape (`naturalWidth > naturalHeight`) — used on cards/thumbnails, where portrait photos
   * (the majority) should keep filling the frame and only landscape ones need letterboxing.
   */
  fit?: "cover" | "contain" | "auto";
}

/**
 * Thin `next/image` wrapper for catalog/product/category images sourced
 * from the database (backlog 6.4). Routes Cloudinary URLs through
 * `cloudinaryLoader` so they're delivered at the rendered width in an
 * auto-negotiated format instead of the original file; every other prop
 * passes straight through to `next/image`.
 *
 * Static brand assets (`/brand/*`) and the navbar logo stay on plain
 * `next/image` — they don't come from Cloudinary.
 */
export function CatalogImage({ src, alt, fit = "cover", className, onLoad, ...props }: CatalogImageProps) {
  const isDataUri = typeof src === "string" && src.startsWith("data:");
  const [autoFit, setAutoFit] = useState<"cover" | "contain">("cover");
  const resolvedFit = fit === "auto" ? autoFit : fit;

  function handleLoad(e: SyntheticEvent<HTMLImageElement>) {
    if (fit === "auto") {
      const { naturalWidth, naturalHeight } = e.currentTarget;
      setAutoFit(naturalWidth > naturalHeight ? "contain" : "cover");
    }
    onLoad?.(e);
  }

  return (
    <Image
      src={src}
      alt={alt}
      {...props}
      onLoad={handleLoad}
      data-fit={resolvedFit}
      className={cn(className, resolvedFit === "contain" ? "object-contain" : "object-cover")}
      loader={cloudinaryLoader}
      unoptimized={isDataUri || props.unoptimized}
    />
  );
}
