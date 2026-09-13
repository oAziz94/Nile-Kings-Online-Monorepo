"use client";

import * as React from "react";
import type { UseFormRegister } from "react-hook-form";
import { Phone, ChevronDown, Check } from "lucide-react";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import { cn } from "@/lib/utils";
import type { AddressFormValues } from "./address-types";

const fieldBoxClass =
  "flex h-12 items-center gap-2.5 border border-[hsl(228_16%_84%)] bg-white px-3.5 focus-within:border-gold-500 focus-within:shadow-[0_0_0_2px_rgba(184,144,47,.14)]";
const bareInputClass =
  "h-full w-0 min-w-0 flex-1 border-0 bg-transparent px-0 font-plex-arabic text-[15px] text-[hsl(228_40%_14%)] placeholder:text-[hsl(228_18%_58%)] focus:outline-none";
const labelClass = "font-plex-arabic text-[13px] font-medium text-[hsl(228_40%_14%)]/80";
const hintClass = "font-plex-arabic text-[12px] text-[hsl(228_18%_55%)]";

function Field({
  id,
  label,
  hint,
  span,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  span?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", span && "sm:col-span-2")}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
      {hint && <span className={hintClass}>{hint}</span>}
    </div>
  );
}

/**
 * The shared field grid for the add/edit form — used both inside the `lg+` side sheet and the
 * below-`lg` full-page state (backlog 6.3). Wired to `react-hook-form`'s `register` directly
 * (not the shadcn `Form`/`FormField` wrapper) so the field boxes can match the design canvas's
 * exact tokens (48px boxes, gold focus ring) — client validation stays a single toast per the
 * inventory (`profile-addresses.md`), not per-field messages, so `FormMessage` isn't used here.
 */
export function AddressFormFields({
  idPrefix,
  register,
}: {
  idPrefix: string;
  register: UseFormRegister<AddressFormValues>;
}) {
  const ids = {
    label: `${idPrefix}-label`,
    governorate: `${idPrefix}-governorate`,
    city: `${idPrefix}-city`,
    area: `${idPrefix}-area`,
    street: `${idPrefix}-street`,
    phone: `${idPrefix}-phone`,
    notes: `${idPrefix}-notes`,
    isDefault: `${idPrefix}-isDefault`,
  };

  return (
    <div className="grid grid-cols-1 gap-[18px_20px] sm:grid-cols-2">
      <Field id={ids.label} label="تسمية (اختياري)" hint="مثل: المنزل، العمل">
        <div className={fieldBoxClass}>
          <input id={ids.label} className={bareInputClass} {...register("label")} />
        </div>
      </Field>

      <Field id={ids.governorate} label="المحافظة">
        <div className={cn(fieldBoxClass, "relative pl-9")}>
          <select
            id={ids.governorate}
            dir="rtl"
            className="h-full w-full flex-1 cursor-pointer appearance-none border-0 bg-transparent px-0 font-plex-arabic text-[15px] text-[hsl(228_40%_14%)] focus:outline-none"
            {...register("governorate")}
          >
            <option value="">اختر المحافظة</option>
            {GOVERNORATE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute left-3.5 h-4 w-4 text-[hsl(228_18%_55%)]" strokeWidth={1.3} />
        </div>
      </Field>

      <Field id={ids.city} label="المدينة">
        <div className={fieldBoxClass}>
          <input id={ids.city} className={bareInputClass} {...register("city")} />
        </div>
      </Field>

      <Field id={ids.area} label="المنطقة">
        <div className={fieldBoxClass}>
          <input id={ids.area} className={bareInputClass} {...register("area")} />
        </div>
      </Field>

      <Field id={ids.street} label="العنوان بالتفصيل" span hint="الشارع ورقم المبنى والدور والشقة.">
        <div className={fieldBoxClass}>
          <input id={ids.street} className={bareInputClass} {...register("street")} />
        </div>
      </Field>

      <Field
        id={ids.phone}
        label="هاتف التوصيل"
        hint="يمكن أن يختلف عن رقم الحساب — هذا رقم من يستلم الطلب."
      >
        <div className={fieldBoxClass}>
          <Phone className="h-4 w-4 shrink-0 text-[hsl(228_18%_55%)]" strokeWidth={1.3} />
          <input
            id={ids.phone}
            type="tel"
            dir="ltr"
            className={cn(bareInputClass, "font-archivo")}
            {...register("phone")}
          />
        </div>
      </Field>

      <Field id={ids.notes} label="ملاحظات (اختياري)" span>
        <textarea
          id={ids.notes}
          rows={3}
          placeholder="مثال: الاتصال قبل الوصول"
          className="min-h-[88px] resize-none border border-[hsl(228_16%_84%)] bg-white px-3.5 py-3 font-plex-arabic text-[15px] text-[hsl(228_40%_14%)] placeholder:text-[hsl(228_18%_58%)] focus:border-gold-500 focus:outline-none focus:shadow-[0_0_0_2px_rgba(184,144,47,.14)]"
          {...register("notes")}
        />
      </Field>

      <label
        htmlFor={ids.isDefault}
        className="flex cursor-pointer items-center gap-2.5 font-plex-arabic text-[14px] text-[hsl(228_40%_14%)] sm:col-span-2"
      >
        <input type="checkbox" id={ids.isDefault} className="peer sr-only" {...register("isDefault")} />
        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center border border-[hsl(228_40%_14%)] text-transparent peer-checked:bg-[hsl(228_40%_14%)] peer-checked:text-papyrus peer-focus-visible:ring-2 peer-focus-visible:ring-gold-500 peer-focus-visible:ring-offset-2">
          <Check className="h-3 w-3" strokeWidth={2.2} />
        </span>
        اجعله العنوان الافتراضي
      </label>
    </div>
  );
}
