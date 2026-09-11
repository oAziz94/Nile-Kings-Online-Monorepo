"use client";

import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { Ankh } from "@/components/brand/ankh";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        return (
          <Toast key={id} variant={variant} {...props}>
            {/* The drawn mark leads every non-error toast, the way the canvas's success and
                info banners carry it; errors stay mark-less so the carnelian hue does the work. */}
            {variant !== "destructive" && (
              <Ankh
                size={16}
                strokeWidth={11}
                className={variant === "success" ? "mt-[3px] shrink-0 text-[hsl(150_36%_30%)]" : "mt-[3px] shrink-0 text-gold-500"}
              />
            )}
            <div className="grid min-w-0 flex-1 gap-0.5">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
