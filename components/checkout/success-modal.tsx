"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

/**
 * Deliberately non-dismissible-by-overlay-click (`closeOnOverlayClick={false}`) — only "تم"
 * closes it, and only then does the caller `refreshCart()`, per `checkout.md`'s InstaPay path:
 * the cart is already empty server-side, but the UI defers the flash until the shopper
 * acknowledges the success message.
 */
export function SuccessModal({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} closeOnOverlayClick={false}>
      <DialogContent className="max-w-sm rounded-none border border-[hsl(228_16%_84%)] bg-papyrus text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl font-bold text-[hsl(228_40%_14%)]">
            تم إرسال طلبك بنجاح
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-[hsl(228_18%_45%)]">
            سيصلك قريبًا رسالة أو اتصال على رقمك لتأكيد الطلب.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            className="w-full rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)] sm:w-auto"
            onClick={onDone}
          >
            تم
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
