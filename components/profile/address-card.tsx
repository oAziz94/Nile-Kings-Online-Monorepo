"use client";

import * as React from "react";
import { Pencil, Trash2, Star, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isSavedAddressIncomplete } from "@/lib/addresses/completeness";
import type { SavedAddress } from "./address-types";

const iconButtonClass =
  "grid h-9 w-9 place-items-center border-0 text-[hsl(228_40%_14%)]/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2";

function formatAddressLines(a: SavedAddress): { first: string; street: string } {
  const first = [a.governorate, a.city, a.area].filter(Boolean).join("، ");
  return { first, street: a.street };
}

export function AddressCard({
  address,
  onEdit,
  onCompleteAddress,
  onSetDefault,
  onDelete,
}: {
  address: SavedAddress;
  onEdit: () => void;
  onCompleteAddress: () => void;
  onSetDefault: () => void;
  onDelete: () => void;
}) {
  const incomplete = isSavedAddressIncomplete(address);
  const { first, street } = formatAddressLines(address);

  return (
    <article
      className={cn(
        "flex flex-col gap-3.5 border bg-papyrus p-[18px] sm:p-[22px_24px]",
        address.isDefault ? "border-[hsl(228_40%_14%)]" : "border-[hsl(228_16%_84%)]",
        incomplete && "border-dashed"
      )}
    >
      <header className="flex items-start justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-plex-arabic text-[16px] font-medium text-[hsl(228_40%_14%)]">
            {address.label || "عنوان بدون تسمية"}
          </span>
          {address.isDefault && (
            <span className="inline-flex h-[22px] items-center gap-1.5 border border-gold-500 px-2 font-plex-arabic text-[12px] font-medium text-gold-600">
              <Star className="h-3 w-3" strokeWidth={1.3} />
              الافتراضي
            </span>
          )}
          {incomplete && (
            <span className="inline-flex h-[22px] items-center gap-1.5 bg-[rgba(184,144,47,.16)] px-2 font-plex-arabic text-[12px] font-medium text-[#9A6B12]">
              <AlertTriangle className="h-3 w-3" strokeWidth={1.3} />
              يحتاج المدينة
            </span>
          )}
        </div>
        <span className="flex shrink-0 gap-0.5">
          <button type="button" aria-label="تعديل" onClick={onEdit} className={iconButtonClass}>
            <Pencil className="h-[18px] w-[18px]" strokeWidth={1.3} />
          </button>
          <button
            type="button"
            aria-label="حذف"
            onClick={onDelete}
            className={cn(iconButtonClass, "text-[hsl(6_58%_42%)]")}
          >
            <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.3} />
          </button>
        </span>
      </header>

      <p className="font-plex-arabic text-[14.5px] leading-[1.7] text-[hsl(228_40%_14%)]">
        {first}
        <br />
        {street}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <span dir="ltr" className="font-archivo text-[13.5px] text-[hsl(228_40%_14%)]/60">
          {address.phone}
        </span>
        {address.notes && (
          <span className="font-plex-arabic text-[12.5px] text-[hsl(228_18%_45%)]">{address.notes}</span>
        )}
      </div>

      {incomplete ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[hsl(228_16%_84%)] pt-3">
          <span className="font-plex-arabic text-[13px] text-[#9A6B12]">
            أضف المدينة حتى يمكن استخدام هذا العنوان عند الدفع.
          </span>
          <Button
            type="button"
            size="sm"
            onClick={onCompleteAddress}
            className="h-10 rounded-none bg-[hsl(228_40%_14%)] px-[18px] text-[13px] text-papyrus hover:bg-[hsl(228_40%_20%)]"
          >
            أكمل العنوان
          </Button>
        </div>
      ) : !address.isDefault ? (
        <div className="border-t border-[hsl(228_16%_84%)] pt-3">
          <button
            type="button"
            onClick={onSetDefault}
            className="border-b border-gold-500 font-plex-arabic text-[13.5px] text-[hsl(228_40%_14%)] hover:text-gold-600"
          >
            تعيين كعنوان افتراضي
          </button>
        </div>
      ) : null}
    </article>
  );
}
