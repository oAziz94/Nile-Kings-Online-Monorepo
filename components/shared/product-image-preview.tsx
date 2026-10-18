"use client";

import * as React from "react";
import { ImageOff, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";

/**
 * Clickable product thumbnail that opens a full-view modal with the image,
 * a title, and a code (slug/SKU) underneath. Built on the `components/ui/dialog.tsx` primitive (10.24): focus moves in, Tab is
 * trapped, Escape / X / outside click close, focus returns to the thumbnail.
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          overlayClassName="z-[200] bg-black/70"
          className="z-[200] w-[calc(100%-2rem)] max-w-lg gap-0 rounded-2xl p-4"
          aria-describedby={undefined}
        >
          <DialogClose
            className="absolute left-3 top-3 rounded-full bg-muted p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </DialogClose>
          <img src={src} alt={dialogTitle} className="mx-auto max-h-[70vh] w-auto rounded-xl object-contain" />
          <div className="mt-3 text-center">
            <DialogTitle className="text-base font-semibold leading-normal tracking-normal text-foreground">
              {dialogTitle}
            </DialogTitle>
            {code && <p className="text-sm text-muted-foreground">{code}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Neutral, non-interactive placeholder for a line item with no variant/product image at all
 * (10.21) — same footprint as `ProductImagePreview` so it drops into the same table cell.
 */
export function ProductImagePlaceholder({
  size = 48,
  fill = false,
  className = "",
}: {
  size?: number;
  /** Fill the parent box (parent must be `relative`) instead of a fixed `size` square; no corner rounding. */
  fill?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-center justify-center bg-papyrus text-stone-400 ${
        fill ? "absolute inset-0" : "rounded-xl"
      } ${className}`}
      style={fill ? undefined : { width: size, height: size }}
    >
      <ImageOff className="h-1/2 w-1/2" />
    </div>
  );
}
