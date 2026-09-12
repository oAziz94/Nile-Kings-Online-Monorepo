"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import { isSavedAddressIncomplete } from "@/lib/addresses/completeness";
import { authLabelClass, authFieldBoxClass, authBareInputClass } from "@/components/auth/auth-ui";
import type { SavedAddress } from "./types";

function AddressRow({
  address,
  selected,
  onSelect,
}: {
  address: SavedAddress;
  selected: boolean;
  onSelect: () => void;
}) {
  const incomplete = isSavedAddressIncomplete(address);
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 border-b border-[hsl(228_16%_84%)] py-4 transition-colors first:border-t",
        selected && "bg-[hsl(38_22%_96%)]"
      )}
    >
      <input
        type="radio"
        name="savedAddress"
        checked={selected}
        onChange={onSelect}
        className="mt-1.5 h-4 w-4 shrink-0 accent-[hsl(228_40%_14%)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-[hsl(228_40%_14%)]">{address.label || address.governorate}</span>
          {address.isDefault && <span className="text-xs text-[hsl(228_18%_45%)]">افتراضي</span>}
          {incomplete && <span className="text-xs text-[hsl(228_18%_45%)]">يحتاج المدينة</span>}
        </div>
        <p className="mt-1 text-sm text-[hsl(228_18%_45%)]">
          {[address.governorate, address.city, address.area, address.street].filter(Boolean).join("، ")}
        </p>
        <p className="mt-1 font-archivo text-sm text-[hsl(228_18%_45%)]" style={{ direction: "ltr" }}>
          {address.phone}
        </p>
      </div>
    </label>
  );
}

export function SavedAddressList({
  addresses,
  selectedAddressId,
  useNewAddress,
  onSelect,
  onAddNew,
  needsCityCompletion,
  pendingCity,
  onPendingCityChange,
}: {
  addresses: SavedAddress[];
  selectedAddressId: string | null;
  useNewAddress: boolean;
  onSelect: (address: SavedAddress) => void;
  onAddNew: () => void;
  needsCityCompletion: boolean;
  pendingCity: string;
  onPendingCityChange: (value: string) => void;
}) {
  const pendingCityId = useId();
  return (
    <div className="mt-5">
      <p className="mb-1 text-sm font-medium text-[hsl(228_40%_14%)]">اختر عنوانًا محفوظًا</p>
      <div role="radiogroup" aria-label="عنوان التوصيل المحفوظ">
        {addresses.map((a) => (
          <AddressRow
            key={a.id}
            address={a}
            selected={!useNewAddress && selectedAddressId === a.id}
            onSelect={() => onSelect(a)}
          />
        ))}
      </div>

      {needsCityCompletion && (
        <div className="mt-4 border-s-2 border-gold-500 bg-[hsl(38_22%_96%)] p-4">
          <p className="text-sm font-medium text-[hsl(228_40%_14%)]">
            هذا العنوان قديم ولا يتضمن المدينة. أدخل المدينة لمتابعة الطلب.
          </p>
          <div className="mt-3 max-w-xs space-y-2">
            <label htmlFor={pendingCityId} className={authLabelClass}>المدينة *</label>
            <div className={authFieldBoxClass()}>
              <input
                id={pendingCityId}
                value={pendingCity}
                onChange={(e) => onPendingCityChange(e.target.value)}
                placeholder="مثال: مدينة نصر"
                required
                className={authBareInputClass}
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-[hsl(228_18%_45%)]">
            سيتم حفظ المدينة على هذا العنوان تلقائيًا عند تأكيد الطلب.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onAddNew}
        className="mt-5 border-b border-gold-500 pb-0.5 text-sm text-[hsl(228_40%_14%)] transition-colors hover:text-gold-600"
      >
        + إضافة عنوان جديد
      </button>
    </div>
  );
}
