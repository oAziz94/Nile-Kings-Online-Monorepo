/**
 * "العميل والتوصيل" card (backlog 9.3 a) — extracted verbatim from
 * `app/(partner)/partner/orders/[id]/page.tsx` (name, phone, address, call/WhatsApp/copy).
 * `extraActions` is an optional slot appended after the built-in row of actions — the admin
 * detail (9.3 c) uses it for "تعديل العنوان" / "ملف العميل", which the partner page never
 * rendered, so passing nothing there keeps the partner's DOM unchanged.
 */
import * as React from "react";
import { Copy, MessageCircle, Phone, UserRound } from "lucide-react";
import { PanelCard } from "@/components/dashboard/panel-card";
import { Button } from "@/components/ui/button";

export type OrderCustomerCardProps = {
  name: string | null;
  phone: string;
  addressLines: string[];
  addressNote?: string | null;
  onCopyAddress: () => void;
  extraActions?: React.ReactNode;
};

export function OrderCustomerCard({
  name,
  phone,
  addressLines,
  addressNote,
  onCopyAddress,
  extraActions,
}: OrderCustomerCardProps) {
  const digitsOnlyPhone = (phone ?? "").replace(/[^\d+]/g, "");
  return (
    <PanelCard title="العميل والتوصيل" icon={<UserRound className="h-5 w-5 text-lapis-800" />}>
      <div className="space-y-2 text-sm">
        <p className="font-extrabold text-ink">{name ?? "عميل بدون اسم"}</p>
        <p dir="ltr" className="text-right text-ink-soft">{phone}</p>
        <p className="leading-relaxed text-ink">{addressLines.join("، ") || "لا يوجد عنوان"}</p>
        {addressNote && (
          <p className="text-ink-soft">
            <strong className="text-ink">ملاحظة العميل: </strong>{addressNote}
          </p>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild type="button" variant="outline" size="sm" className="rounded-full">
            <a href={`tel:${digitsOnlyPhone}`}>
              <Phone className="h-3.5 w-3.5" />
              اتصال
            </a>
          </Button>
          <Button asChild type="button" variant="outline" size="sm" className="rounded-full">
            <a href={`https://wa.me/${digitsOnlyPhone.replace(/^\+/, "")}`} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-3.5 w-3.5" />
              واتساب
            </a>
          </Button>
          <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onCopyAddress}>
            <Copy className="h-3.5 w-3.5" />
            نسخ العنوان
          </Button>
          {extraActions}
        </div>
      </div>
    </PanelCard>
  );
}
