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
import { piastresToEgp, type CheckoutSummaryResponse } from "./types";

export function InstapayModal({
  open,
  onOpenChange,
  summary,
  instapayDetails,
  instapayTransferHref,
  onAddressClick,
  onCancel,
  onConfirm,
  confirmLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: CheckoutSummaryResponse | null;
  instapayDetails: { ipa: string; qrImage: string };
  instapayTransferHref: string;
  onAddressClick: (e: React.MouseEvent<HTMLAnchorElement>) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-none border border-[hsl(228_16%_84%)] bg-papyrus text-right" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-amiri text-xl font-bold text-[hsl(228_40%_14%)]">
            الدفع عبر InstaPay
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm text-[hsl(228_18%_45%)]">
            قم بتحويل قيمة الطلب عبر InstaPay لإتمام الطلب. شحن أقل عند الدفع عبر InstaPay — تم إلغاء رسوم الاستلام.
          </DialogDescription>
        </DialogHeader>
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
            {summary && (
              <p className="mt-3 font-archivo text-base font-semibold text-[hsl(228_40%_14%)]" style={{ direction: "ltr" }}>
                المبلغ: {formatNumberEn(piastresToEgp(summary.finalTotal))} ج.م
              </p>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)] hover:bg-[hsl(228_40%_14%)]/5"
            onClick={onCancel}
            disabled={confirmLoading}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            className="rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]"
            onClick={onConfirm}
            disabled={confirmLoading}
          >
            {confirmLoading ? "جاري إنشاء الطلب…" : "أتممت التحويل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
