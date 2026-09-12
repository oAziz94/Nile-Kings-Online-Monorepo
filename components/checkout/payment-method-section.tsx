"use client";

import { cn } from "@/lib/utils";
import { CHECKOUT_PAYMENT_OPTIONS } from "@/lib/checkout/types";

export function PaymentMethodSection({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="mt-5" role="radiogroup" aria-label="طريقة الدفع">
      {CHECKOUT_PAYMENT_OPTIONS.map((opt) => (
        <label
          key={opt.value}
          className={cn(
            "flex cursor-pointer items-start gap-3 border-b border-[hsl(228_16%_84%)] py-4 first:border-t",
            value === opt.value && "bg-[hsl(38_22%_96%)]"
          )}
        >
          <input
            type="radio"
            name="paymentMethod"
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
            className="mt-1 h-4 w-4 shrink-0 accent-[hsl(228_40%_14%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
          />
          <div>
            <span className="font-medium text-[hsl(228_40%_14%)]">{opt.label}</span>
            {opt.value === "INSTAPAY_PREPAID" && (
              <p className="mt-1 text-sm text-[hsl(150_38%_32%)]">شحن أقل عند الدفع عبر InstaPay</p>
            )}
          </div>
        </label>
      ))}
    </div>
  );
}
