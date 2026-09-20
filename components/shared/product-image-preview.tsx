"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ImageOff, X } from "lucide-react";

/**
 * Clickable product thumbnail that opens a full-view modal with the image,
 * a title, and a code (slug/SKU) underneath. Closes on outside click or Escape.
 */
export function ProductImagePreview({
  src,
  title,
  code,
  size = 48,
  className = "",
  modalTitle,
}: {
  src: string;
  title: string;
  code?: string | null;
  size?: number;
  className?: string;
  /** Alt text / caption used inside the dialog only (defaults to `title`) — lets a caller
   * label the thumbnail with just the product name while the enlarged image also names the
   * variant (e.g. "قميص – أحمر، L"). */
  modalTitle?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const dialogTitle = modalTitle ?? title;

  React.useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`block cursor-zoom-in ${className}`}
        style={{ width: size, height: size }}
        aria-label={title}
      >
        <img src={src} alt={title} className="h-full w-full object-cover" style={{ width: size, height: size }} />
      </button>

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="relative max-w-lg rounded-2xl bg-background p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="absolute left-3 top-3 rounded-full bg-muted p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                aria-label="إغلاق"
              >
                <X className="h-4 w-4" />
              </button>
              <img src={src} alt={dialogTitle} className="mx-auto max-h-[70vh] w-auto rounded-xl object-contain" />
              <div className="mt-3 text-center">
                <p className="font-semibold text-foreground">{dialogTitle}</p>
                {code && <p className="text-sm text-muted-foreground">{code}</p>}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

/**
 * Neutral, non-interactive placeholder for a line item with no variant/product image at all
 * (10.21) — same footprint as `ProductImagePreview` so it drops into the same table cell.
 */
export function ProductImagePlaceholder({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center rounded-xl bg-papyrus text-stone-400 ${className}`}
      style={{ width: size, height: size }}
    >
      <ImageOff className="h-1/2 w-1/2" />
    </div>
  );
}
