"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Side-panel drawer built directly on `@radix-ui/react-dialog` (same real focus-trap/Escape
 * behaviour as `components/ui/dialog.tsx`, backlog 3.2) instead of a hand-rolled overlay+panel
 * pair — needed by `CartDrawer` (backlog 4.10), which previously had neither Escape-to-close nor
 * a focus trap. `side="right"` (default) matches the drawer's pre-existing physical placement —
 * see the note on `sheetVariants` below for why it's physical, not logical.
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-[110] bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:transition-none",
      className
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

// Physical (not logical start/end) sides on purpose: this storefront is always `dir="rtl"`
// (Arabic-only), and the pre-existing hand-rolled `CartDrawer` this replaces always pinned to
// the physical right in RTL (`rtl:right-0`) — the conventional "familiar corner" placement
// e-commerce cart drawers use even on RTL sites, not the logical inline-end (which would be the
// left edge under `dir="rtl"`). Kept as an explicit choice, not solved generically, since a
// truly bidirectional variant isn't needed anywhere else in this app yet.
const sheetVariants = cva(
  "fixed z-[110] flex h-full w-full max-w-md flex-col gap-0 border-[hsl(228_40%_14%)] bg-papyrus shadow-2xl transition ease-in-out data-[state=closed]:duration-200 data-[state=open]:duration-300 motion-reduce:transition-none motion-reduce:animate-none",
  {
    variants: {
      side: {
        right: "inset-y-0 right-0 border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
        left: "inset-y-0 left-0 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
      },
    },
    defaultVariants: { side: "right" },
  }
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(sheetVariants({ side }), className)}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex h-16 shrink-0 items-center justify-between border-b border-[hsl(228_16%_86%)] px-4",
        className
      )}
      {...props}
    />
  );
}

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("font-amiri text-lg font-bold text-[hsl(228_40%_14%)]", className)}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetCloseButton = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Close
    ref={ref}
    aria-label="إغلاق"
    className={cn(
      "flex h-9 w-9 items-center justify-center text-[hsl(228_18%_45%)] transition-colors hover:text-[hsl(228_40%_14%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2",
      className
    )}
    {...props}
  >
    <X className="h-5 w-5" strokeWidth={1.3} />
  </DialogPrimitive.Close>
));
SheetCloseButton.displayName = "SheetCloseButton";

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetCloseButton,
};
