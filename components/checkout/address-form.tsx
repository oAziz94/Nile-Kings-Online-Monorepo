"use client";

import { useId } from "react";
import Link from "next/link";
import { GOVERNORATE_OPTIONS } from "@/lib/services/shipping";
import {
  authLabelClass,
  authFieldBoxClass,
  authBareInputClass,
} from "@/components/auth/auth-ui";
import { cn } from "@/lib/utils";
import type { AddressFormValues } from "./types";

// The canvas's own 10×6 chevron (same asset `auth-ui.tsx` draws for the country select), reused
// here for a full-width governorate select rather than the auth surface's inline-end, flex-none
// country-code select — a different layout, same drawn-chevron language.
const selectChevron =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='hsl(228 14%25 45%25)' stroke-width='1.2'/%3E%3C/svg%3E\")";
const fullWidthSelectClass = cn(
  "h-full w-full flex-1 cursor-pointer appearance-none rounded-none border-0 bg-transparent bg-no-repeat px-4 font-plex-arabic text-[15px] text-[hsl(228_40%_14%)]",
  "bg-[position:left_16px_center]",
  "focus-visible:outline-none focus-visible:shadow-[inset_0_-2px_0_hsl(42_78%_55%)]"
);
const fullWidthSelectStyle: React.CSSProperties = { backgroundImage: selectChevron };

/** A single labelled field box — the auth surface's field styling, reused for checkout's new-address form. Uses a real `<label htmlFor>`, not just visually-adjacent text (accessibility bar). */
function Field({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className={authLabelClass}>
        {label}
        {required ? " *" : " (اختياري)"}
      </label>
      {children}
    </div>
  );
}

export function AddressForm({
  address,
  onChange,
}: {
  address: AddressFormValues;
  onChange: (next: AddressFormValues) => void;
}) {
  const idPrefix = useId();
  const ids = {
    label: `${idPrefix}-label`,
    governorate: `${idPrefix}-governorate`,
    city: `${idPrefix}-city`,
    phone: `${idPrefix}-phone`,
    area: `${idPrefix}-area`,
    street: `${idPrefix}-street`,
    notes: `${idPrefix}-notes`,
  };

  return (
    <div className="mt-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={ids.label} label="تسمية">
          <div className={authFieldBoxClass()}>
            <input
              id={ids.label}
              value={address.label}
              onChange={(e) => onChange({ ...address, label: e.target.value })}
              placeholder="مثال: المنزل"
              className={authBareInputClass}
            />
          </div>
        </Field>

        <Field id={ids.governorate} label="المحافظة" required>
          <div className={authFieldBoxClass()}>
            <select
              id={ids.governorate}
              value={address.governorate}
              onChange={(e) => onChange({ ...address, governorate: e.target.value })}
              required
              dir="rtl"
              className={fullWidthSelectClass}
              style={fullWidthSelectStyle}
            >
              <option value="">اختر المحافظة</option>
              {GOVERNORATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </Field>

        <Field id={ids.city} label="المدينة" required>
          <div className={authFieldBoxClass()}>
            <input
              id={ids.city}
              value={address.city}
              onChange={(e) => onChange({ ...address, city: e.target.value })}
              required
              className={authBareInputClass}
            />
          </div>
        </Field>

        <Field id={ids.phone} label="هاتف التوصيل" required>
          <div className={authFieldBoxClass()}>
            <input
              id={ids.phone}
              type="tel"
              value={address.phone}
              onChange={(e) => onChange({ ...address, phone: e.target.value })}
              required
              dir="ltr"
              className={authBareInputClass}
            />
          </div>
        </Field>

        <Field id={ids.area} label="المنطقة" required>
          <div className={authFieldBoxClass()}>
            <input
              id={ids.area}
              value={address.area}
              onChange={(e) => onChange({ ...address, area: e.target.value })}
              required
              className={authBareInputClass}
            />
          </div>
        </Field>

        <div className="sm:col-span-2">
          <Field id={ids.street} label="العنوان بالتفصيل" required>
            <div className={authFieldBoxClass()}>
              <input
                id={ids.street}
                value={address.street}
                onChange={(e) => onChange({ ...address, street: e.target.value })}
                required
                className={authBareInputClass}
              />
            </div>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field id={ids.notes} label="ملاحظات">
            <div className={authFieldBoxClass()}>
              <input
                id={ids.notes}
                value={address.notes}
                onChange={(e) => onChange({ ...address, notes: e.target.value })}
                placeholder="أي ملاحظات للتوصيل"
                className={authBareInputClass}
              />
            </div>
          </Field>
        </div>
      </div>

      <p className="mt-4 text-sm text-[hsl(228_18%_45%)]">
        يمكنك إدارة عناوينك من{" "}
        <Link href="/profile/addresses" className="border-b border-gold-500 text-[hsl(228_40%_14%)] hover:text-gold-600">
          عناويني
        </Link>
        . العنوان الذي تدخله هنا سيُحفظ أيضًا في عناوينك تلقائيًا.
      </p>
    </div>
  );
}
