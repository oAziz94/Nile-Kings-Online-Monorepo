"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "./types";

/**
 * Backlog 10.50 — opened only AFTER the order exists (status CREATED, stock reserved), so the
 * QR/amount is never shown for a cart we cannot fulfil. Not dismissible by overlay/Escape and
 * has exactly two actions: "أتممت التحويل" and "إلغاء الطلب" (which asks for confirmation first).
 */
export function InstapayModal({
  open,
  orderNumber,
  amountPiastres,
  instapayDetails,
  instapayTransferHref,
  onAddressClick,
  onConfirm,
  onCancelOrder,
  confirmLoading,
  cancelLoading,
}: {
  open: boolean;
  /** Short display number of the placed order (already formatted, e.g. "AB12CD34"). */
  orderNumber: string;
  /** Server-returned `finalTotal` of the placed order, in piastres. */
  amountPiastres: number | null;
  instapayDetails: { ipa: string; qrImage: string };
  instapayTransferHref: string;
  onAddressClick: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onConfirm: () => void;
  onCancelOrder: () => void;
  confirmLoading: boolean;
  cancelLoading: boolean;
}) {
  const [confirmingCancel, setConfirmingCancel] = React.useState(false);
  React.useEffect(() => {
    if (!open) setConfirmingCancel(false);
  }, [open]);
  const busy = confirmLoading || cancelLoading;

  return (
    <Dialog open={open} onOpenChange={() => undefined} closeOnOverlayClick={false}>
      <DialogContent className="max-w-sm rounded-none border border-[hsl(228_16%_84%)] bg-papyrus text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl font-bold text-[hsl(228_40%_14%)]">
            {confirmingCancel ? "إلغاء الطلب؟" : "الدفع عبر InstaPay"}
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-[hsl(228_18%_45%)]">
            {confirmingCancel ? (
              "سيتم إلغاء الطلب وإعادة الأصناف للمخزون"
            ) : (
              <>
                تم إنشاء طلبك رقم{" "}
                <span className="font-archivo font-semibold text-[hsl(228_40%_14%)]" style={{ direction: "ltr", unicodeBidi: "isolate" }} data-testid="instapay-order-number">
                  {orderNumber}
                </span>{" "}
                وهو بانتظار التحويل. قم بتحويل قيمة الطلب عبر InstaPay. شحن أقل عند الدفع عبر InstaPay — تم إلغاء رسوم الاستلام.
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        {!confirmingCancel && (
          <div className="flex flex-col items-center gap-4 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- static local QR asset, not a Product/Variant image */}
            <img
              src={instapayDetails.qrImage}
              alt="InstaPay QR"
              className="h-48 w-48 border border-[hsl(228_16%_84%)] bg-[hsl(38_22%_95%)] object-contain"
            />
            <div className="text-center">
              <a
                href={instapayTransferHref}
                onClick={onAddressClick}
                className="border-b border-gold-500 pb-0.5 text-sm font-semibold text-[hsl(228_40%_14%)] hover:text-gold-600"
                rel="noopener noreferrer"
              >
                {instapayDetails.ipa}
              </a>
              <p className="mt-1 text-xs text-[hsl(228_18%_45%)]">اضغط لفتح تطبيق InstaPay وإتمام التحويل</p>
              {amountPiastres != null && (
                <p className="mt-3 font-archivo text-base font-semibold text-[hsl(228_40%_14%)]" style={{ direction: "ltr" }}>
                  المبلغ: {formatNumberEn(piastresToEgp(amountPiastres))} ج.م
                </p>
              )}
            </div>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-0">
          {confirmingCancel ? (
            <>
              <Button
                type="button"
                variant="outline"
                className="rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)] hover:bg-[hsl(228_40%_14%)] hover:text-papyrus"
                onClick={() => setConfirmingCancel(false)}
                disabled={busy}
              >
                رجوع
              </Button>
              <Button
                type="button"
                className="rounded-none border border-carnelian-500 bg-danger-bg text-danger-text hover:bg-danger-bg"
                onClick={onCancelOrder}
                disabled={busy}
              >
                {cancelLoading ? "جاري الإلغاء…" : "نعم، إلغاء الطلب"}
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)] hover:bg-[hsl(228_40%_14%)] hover:text-papyrus"
                onClick={() => setConfirmingCancel(true)}
                disabled={busy}
              >
                إلغاء الطلب
              </Button>
              <Button
                type="button"
                className="rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]"
                onClick={onConfirm}
                disabled={busy}
              >
                {confirmLoading ? "جاري التأكيد…" : "أتممت التحويل"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
