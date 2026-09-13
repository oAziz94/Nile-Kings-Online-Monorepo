"use client";

import * as React from "react";
import { ChevronLeft, Clock, Package, ShoppingBag } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetCloseButton,
  SheetTrigger,
} from "@/components/ui/sheet";
import { DistributorDetail } from "./distributor-detail";
import { formatDateEn, formatNumberEn } from "@/lib/format-en-numbers";
import { cn } from "@/lib/utils";

export type RosterDistributor = {
  id: string;
  name: string;
  phone: string;
  isActive: boolean;
  sellableUnits: number;
  pendingRequestsCount: number;
  lastActivityAt: string | null;
};

/** Dotted status pill per `design-canvas/partner-v2/build.mjs`'s `.pill` vocabulary. */
function DotPill({
  tone,
  children,
}: {
  tone: "success" | "neutral" | "warning";
  children: React.ReactNode;
}) {
  const toneClasses = {
    success: "bg-malachite-bg text-malachite-text",
    neutral: "bg-stone-100 text-ink-soft",
    warning: "bg-gold-50 text-gold-600",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-extrabold",
        toneClasses[tone]
      )}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * Roster card (backlog 5.5) — the `.card`/well/pill vocabulary from `Main.dc.html` and
 * `Stock.dc.html`'s side cards (e.g. "طلبات التوريد الواردة"), since there is no dedicated
 * network artboard. `SheetTrigger asChild` wraps the whole card so opening the detail
 * sheet returns focus here on close (the Radix primitive's own behaviour, per the task).
 */
export function RosterCard({ distributor }: { distributor: RosterDistributor }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          data-testid="roster-card"
          data-distributor-id={distributor.id}
          className="flex w-full flex-col gap-3 rounded-2xl bg-white p-5 text-right shadow-soft transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
        >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-extrabold text-ink">{distributor.name}</p>
            <p dir="ltr" className="mt-0.5 text-left text-xs font-semibold text-ink-soft">
              {distributor.phone}
            </p>
          </div>
          <DotPill tone={distributor.isActive ? "success" : "neutral"}>
            {distributor.isActive ? "نشط" : "معطّل"}
          </DotPill>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-stone-100 pt-3">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-600">
              <Package className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p dir="ltr" className="text-sm font-extrabold text-ink">
                {formatNumberEn(distributor.sellableUnits)}
              </p>
              <p className="text-[11px] text-ink-soft">قابل للبيع</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-50 text-gold-600">
              <ShoppingBag className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p dir="ltr" className="text-sm font-extrabold text-ink">
                {formatNumberEn(distributor.pendingRequestsCount)}
              </p>
              <p className="text-[11px] text-ink-soft">طلبات بانتظارك</p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-stone-100 pt-3 text-xs text-ink-soft">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" strokeWidth={2} />
            {distributor.lastActivityAt
              ? `آخر نشاط ${formatDateEn(distributor.lastActivityAt)}`
              : "لا يوجد نشاط بعد"}
          </span>
          <span className="flex items-center gap-1 font-bold text-lapis-800">
            التفاصيل
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
        </div>
      </button>
      </SheetTrigger>
      <SheetContent side="right" className="max-w-lg bg-white font-cairo">
        <SheetHeader>
          <div>
            <SheetTitle className="font-cairo text-base text-ink">{distributor.name}</SheetTitle>
            <p dir="ltr" className="mt-0.5 text-left text-xs font-semibold text-ink-soft">
              {distributor.phone}
            </p>
          </div>
          <SheetCloseButton />
        </SheetHeader>
        <DistributorDetail distributorId={distributor.id} open={open} />
      </SheetContent>
    </Sheet>
  );
}
