"use client";

import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitive.Provider;

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      // Top-centre at every size (user's 2026-09-11 follow-up: noticeable, not tucked in a corner).
      "fixed inset-x-0 top-0 z-[100] mx-auto flex max-h-screen w-full flex-col gap-3 p-4 sm:top-[120px] sm:max-w-[560px] sm:p-4",
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

/**
 * A notice, not a widget (user's 2026-09-11 follow-up: "larger, more stylish, on top of the
 * screen"): a full-width sheet at the top-centre, radius 0, a 1px ink rule and a 4px accent bar
 * on the inline-start edge in the semantic hue (gold for information, malachite for success,
 * carnelian for errors), 15–16px type with room around it, and a long soft lapis shadow so it
 * lifts off the page. Slides in from the top at every size. Shared site-wide.
 */
const toastVariants = cva(
  "group pointer-events-auto relative flex w-full items-start gap-4 overflow-hidden rounded-none border border-[hsl(228_40%_14%)]/70 bg-papyrus/80 py-5 pl-12 pr-6 backdrop-blur-md text-right text-[hsl(228_40%_14%)] shadow-[0_24px_60px_-12px_rgba(21,26,46,0.28)] transition-all before:absolute before:inset-y-0 before:right-0 before:w-1 before:content-[''] data-[swipe=cancel]:translate-x-0 data-[swipe=end]:translate-x-[var(--radix-toast-swipe-end-x)] data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)] data-[swipe=move]:transition-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[swipe=end]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-top-full data-[state=open]:slide-in-from-top-full",
  {
    variants: {
      variant: {
        default: "before:bg-gold-500",
        destructive: "destructive group border-[hsl(6_58%_42%)] text-[hsl(6_58%_30%)] before:bg-[hsl(6_58%_42%)]",
        success: "before:bg-[hsl(150_36%_36%)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export type ToastProps = React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> &
  VariantProps<typeof toastVariants>;

export type ToastActionElement = React.ReactElement;

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  ToastProps
>(({ className, variant, ...props }, ref) => {
  return (
    <ToastPrimitive.Root
      ref={ref}
      className={cn(toastVariants({ variant }), className)}
      {...props}
    />
  );
});
Toast.displayName = ToastPrimitive.Root.displayName;

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Action>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Action
    ref={ref}
    className={cn(
      "inline-flex h-8 shrink-0 items-center justify-center rounded-none border border-current bg-transparent px-3 text-[13px] font-medium transition-colors hover:bg-current/10 focus:outline-none focus:ring-2 focus:ring-gold-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
      className
    )}
    {...props}
  />
));
ToastAction.displayName = ToastPrimitive.Action.displayName;

const ToastClose = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Close>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Close>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Close
    ref={ref}
    className={cn(
      "absolute left-3 top-3 rounded-none p-1.5 text-current opacity-55 transition-opacity hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-gold-500",
      className
    )}
    toast-close=""
    {...props}
  >
    <X className="h-4 w-4" strokeWidth={1.4} />
  </ToastPrimitive.Close>
));
ToastClose.displayName = ToastPrimitive.Close.displayName;

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn("text-[16px] font-semibold leading-[1.5]", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("mt-1 text-[14px] leading-[1.7] text-[hsl(228_18%_34%)]", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

export {
  ToastProvider,
  ToastViewport,
  Toast,
  ToastTitle,
  ToastDescription,
  ToastClose,
  ToastAction,
};
