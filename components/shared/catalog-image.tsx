import { useState, type CSSProperties, type SyntheticEvent } from "react";
import Image, { type ImageProps } from "next/image";
import { cloudinaryLoader } from "@/lib/images/cloudinary-loader";
import { cn } from "@/lib/utils";

export interface CatalogImageProps extends ImageProps {
  /**
   * Backlog 10.20 — real catalog photos are a mix of shapes (measured: 47% tall portrait, 31%
   * landscape, 21% ~4:5) but every frame is a fixed 4:5 so the grid never jumps. Default `"cover"`
   * keeps today's behaviour (portrait photos already fill the frame correctly). `"contain"` shows
   * the whole photo on the papyrus background. `"auto"` starts as `"cover"` and switches to
   * `"contain"` once the real image loads and turns out to be landscape (`naturalWidth >
   * naturalHeight`).
   *
   * Backlog 10.25 — the owner rejected `"contain"` on the PDP (a landscape photo filled only
   * ~60% of the frame height between two papyrus bars). `"balanced"` renders as `"cover"` until
   * load, then reads the loaded photo's aspect against the frame's own aspect and enlarges the
   * image box symmetrically beyond the frame by the geometric mean of the frame's cover and
   * contain scales, so crop and margin are split evenly instead of picking either extreme. Used
   * on the PDP main frame, lightbox and gallery thumbnails, and on cards/quick-shop/cart/checkout/
   * orders in place of 10.20's `"auto"`.
   */
  fit?: "cover" | "contain" | "auto" | "balanced";
}

/** Exported so the split between crop and margin can be biased later without touching the maths:
 * 0.5 is the geometric mean (equal split between the frame's cover and contain scales); moving it
 * toward 1 favours less crop (closer to `"contain"`), toward 0 favours less margin (closer to
 * `"cover"`). */
export const BALANCE_EXPONENT = 0.5;

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
export function CatalogImage({ src, alt, fit = "cover", className, style, onLoad, ...props }: CatalogImageProps) {
  const isDataUri = typeof src === "string" && src.startsWith("data:");
  const [autoFit, setAutoFit] = useState<"cover" | "contain">("cover");
  // `null` = not loaded yet (renders as cover); once loaded, the geometric-mean scale factor
  // between the frame's cover and contain scales for this photo (>= 1; 1 means the photo's aspect
  // already matches the frame's, so it fills exactly with no crop or margin).
  const [balance, setBalance] = useState<number | null>(null);

  const resolvedFit = fit === "auto" ? autoFit : fit;
  // Before load, `"balanced"` renders as plain cover (no computed scale yet); the `data-fit`
  // attribute always reads `"balanced"` for this fit so tests can wait on it directly, but the
  // visual object-fit only switches to `contain` once `balance` is known.
  const balancedLoaded = fit === "balanced" && balance !== null;

  function handleLoad(e: SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    if (fit === "auto") {
      setAutoFit(img.naturalWidth > img.naturalHeight ? "contain" : "cover");
    } else if (fit === "balanced") {
      // For a `fill` image the <img> itself is absolutely positioned to match its frame
      // (`inset: 0` before this component overrides it), so `clientWidth`/`clientHeight` here are
      // the frame's own rendered dimensions, independent of the photo's natural size.
      const { naturalWidth: photoW, naturalHeight: photoH, clientWidth: frameW, clientHeight: frameH } = img;
      if (photoW > 0 && photoH > 0 && frameW > 0 && frameH > 0) {
        const cover = Math.max(frameW / photoW, frameH / photoH);
        const contain = Math.min(frameW / photoW, frameH / photoH);
        setBalance(Math.pow(cover / contain, BALANCE_EXPONENT));
      } else {
        setBalance(1);
      }
    }
    onLoad?.(e);
  }

  // A CSS `transform: scale()` enlarges the rendered image symmetrically from its own centre —
  // `object-fit: contain` (applied via className below) fits the photo inside the img's own box
  // first (which, for a `fill` image, is the frame itself), then the scale lands the photo on the
  // geometric-mean scale between the frame's cover and contain scales. `transform` is purely
  // visual (it doesn't change layout/`clientWidth`, so the frame's own `overflow-hidden` still
  // clips the overflow exactly like a crop) and works the same whether the image is `fill` or a
  // fixed-size `<img>` (some catalog thumbnails use explicit `width`/`height` instead of `fill`).
  const balancedStyle: CSSProperties | undefined =
    fit === "balanced" && balance !== null ? { transform: `scale(${balance})` } : undefined;

  return (
    <Image
      src={src}
      alt={alt}
      {...props}
      onLoad={handleLoad}
      data-fit={resolvedFit}
      data-balance={fit === "balanced" && balance !== null ? balance.toFixed(3) : undefined}
      style={{ ...style, ...balancedStyle }}
      className={cn(
        className,
        resolvedFit === "contain" || balancedLoaded ? "object-contain" : "object-cover"
      )}
      loader={cloudinaryLoader}
      unoptimized={isDataUri || props.unoptimized}
    />
  );
}
