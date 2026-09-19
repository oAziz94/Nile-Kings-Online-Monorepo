import Image, { type ImageProps } from "next/image";
import { cloudinaryLoader } from "@/lib/images/cloudinary-loader";

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
export function CatalogImage({ src, alt, ...props }: ImageProps) {
  const isDataUri = typeof src === "string" && src.startsWith("data:");
  return (
    <Image
      src={src}
      alt={alt}
      {...props}
      loader={cloudinaryLoader}
      unoptimized={isDataUri || props.unoptimized}
    />
  );
}
