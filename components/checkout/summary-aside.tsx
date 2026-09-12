"use client";

import { useId } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Price } from "@/components/shared/price";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import type { Cart } from "@/contexts/cart-context";
import { piastresToEgp, type CheckoutSummaryResponse } from "./types";

function CouponField({
  couponCode,
  appliedCouponCode,
  onCouponCodeChange,
  onApply,
  onClear,
}: {
  couponCode: string;
  appliedCouponCode: string | null | undefined;
  onCouponCodeChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const couponInputId = useId();
  return (
    <div className="border-b border-[hsl(228_16%_84%)] pb-5">
      <label htmlFor={couponInputId} className="mb-2 block text-xs font-medium text-[hsl(228_18%_45%)]">
        الرقم التسلسلي للخصم
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            id={couponInputId}
            value={couponCode}
            onChange={(e) => onCouponCodeChange(e.target.value)}
            placeholder="اختياري"
            className="h-11 w-full rounded-none border border-[hsl(40_12%_72%)] bg-transparent px-3 pe-9 text-sm text-[hsl(228_40%_14%)] placeholder:text-[hsl(228_8%_66%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
          />
          {(couponCode.trim() || appliedCouponCode) && (
            <button
              type="button"
              onClick={onClear}
              className="absolute end-2 top-1/2 -translate-y-1/2 grid h-6 w-6 place-items-center text-[hsl(228_18%_45%)] hover:text-[hsl(228_40%_14%)]"
              aria-label="إزالة كود الخصم"
            >
              <X className="h-4 w-4" strokeWidth={1.3} />
            </button>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-11 shrink-0 rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)] hover:bg-[hsl(228_40%_14%)]/5"
          onClick={onApply}
        >
          طبق
        </Button>
      </div>
      {appliedCouponCode && (
        <p className="mt-2 text-xs text-[hsl(150_38%_32%)]">تم تطبيق: {appliedCouponCode}</p>
      )}
      {couponCode.trim() && !appliedCouponCode && (
        <p className="mt-2 text-xs text-destructive">كود الخصم غير صالح أو منتهي الصلاحية.</p>
      )}
    </div>
  );
}

export function SummaryAside({
  cart,
  summary,
  summaryLoading,
  paymentMethod,
  couponCode,
  onCouponCodeChange,
  onApplyCoupon,
  onClearCoupon,
  placeLoading,
}: {
  cart: Cart | null;
  summary: CheckoutSummaryResponse | null;
  summaryLoading: boolean;
  paymentMethod: string;
  couponCode: string;
  onCouponCodeChange: (value: string) => void;
  onApplyCoupon: () => void;
  onClearCoupon: () => void;
  placeLoading: boolean;
}) {
  const shippingLine = summary
    ? piastresToEgp(summary.shippingFee + (paymentMethod === "COD" ? summary.codFee : 0))
    : null;

  return (
    <aside
      aria-labelledby="checkout-summary-heading"
      className="flex flex-col gap-5 border border-[hsl(228_40%_14%)] p-6 lg:sticky lg:top-24"
    >
      <h2 id="checkout-summary-heading" className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)]">
        ملخص الطلب
      </h2>

      <CouponField
        couponCode={couponCode}
        appliedCouponCode={summary?.appliedCouponCode}
        onCouponCodeChange={onCouponCodeChange}
        onApply={onApplyCoupon}
        onClear={onClearCoupon}
      />

      <div className={cn("relative space-y-3 text-sm", summaryLoading && "opacity-50")}>
        {summaryLoading && (
          <div
            role="status"
            aria-live="polite"
            className="nk-shimmer pointer-events-none absolute inset-0"
          >
            <span className="sr-only">جاري الحساب…</span>
          </div>
        )}
        <div className="flex justify-between text-[hsl(228_18%_45%)]">
          <span>المجموع الفرعي {cart ? `${cart.itemCount.toLocaleString("en-US")} عناصر` : ""}</span>
          <Price amount={summary ? piastresToEgp(summary.subtotal) : cart?.subtotalEgp ?? 0} />
        </div>

        {summary && summary.seniorFreeValue > 0 && (
          <div className="flex justify-between text-[hsl(150_38%_32%)]">
            <span>خصم العرض الخاص</span>
            <span className="font-archivo" style={{ direction: "ltr" }}>
              -{piastresToEgp(summary.seniorFreeValue).toLocaleString("en-US")} ج.م
            </span>
          </div>
        )}

        {summary && summary.couponDiscount > 0 && (
          <div className="flex justify-between text-[hsl(150_38%_32%)]">
            <span>خصم كود</span>
            <span className="font-archivo" style={{ direction: "ltr" }}>
              -{piastresToEgp(summary.couponDiscount).toLocaleString("en-US")} ج.م
            </span>
          </div>
        )}

        <div className="flex justify-between text-[hsl(228_18%_45%)]">
          <span>رسوم الشحن</span>
          {summary ? (
            <Price amount={shippingLine!} />
          ) : (
            <span className="text-[13px] text-[hsl(228_18%_60%)]">يُحسب بعد إكمال العنوان</span>
          )}
        </div>
      </div>

      <div className="flex items-baseline justify-between border-t border-[hsl(228_40%_14%)] pt-4">
        <span className="font-amiri text-2xl font-bold text-[hsl(228_40%_14%)]">الإجمالي</span>
        {summary ? (
          <span className="font-archivo text-[28px] font-semibold text-[hsl(228_40%_14%)]" style={{ direction: "ltr" }}>
            {piastresToEgp(summary.finalTotal).toLocaleString("en-US")}{" "}
            <span className="font-plex-arabic text-sm font-normal text-[hsl(228_18%_45%)]">ج.م</span>
          </span>
        ) : (
          <span className="text-sm font-normal text-[hsl(228_18%_45%)]">يُحسب بعد إكمال العنوان</span>
        )}
      </div>

      <Button
        type="submit"
        size="lg"
        className="h-14 w-full rounded-none bg-[hsl(228_40%_14%)] text-base font-medium text-papyrus hover:bg-[hsl(228_40%_20%)]"
        disabled={!summary || placeLoading}
      >
        {placeLoading ? "جاري إنشاء الطلب…" : "تأكيد الطلب"}
      </Button>

      <Link
        href="/cart"
        className="self-center border-b border-gold-500 pb-0.5 text-sm text-[hsl(228_40%_14%)] transition-colors hover:text-gold-600"
      >
        العودة للسلة
      </Link>

      <p className="m-0 text-center text-xs leading-relaxed text-[hsl(228_18%_45%)]">
        الدفع عند الاستلام أو عبر إنستاباي.
      </p>
    </aside>
  );
}
