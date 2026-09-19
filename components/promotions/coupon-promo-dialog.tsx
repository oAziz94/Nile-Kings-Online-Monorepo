"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStorefrontBootstrap } from "@/components/storefront/storefront-bootstrap-provider";

/** Session-only: promo can show again after the browser session ends. */
const STORAGE_KEY = "nk_coupon_promo_dismissed_session";

type PromoMessage = { id: string; message: string };

export function CouponPromoDialog() {
  const bootstrap = useStorefrontBootstrap();
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<PromoMessage[]>([]);
  const shownIdsRef = React.useRef<string[]>([]);
  const processedRef = React.useRef(false);

  // Messages come from the shared bootstrap request (backlog 6.2) instead of this component's
  // own `/api/promotions/coupon-popup-messages` fetch.
  React.useEffect(() => {
    if (bootstrap.status === "loading" || processedRef.current) return;
    processedRef.current = true;
    try {
      const rawList = bootstrap.data?.couponMessages?.messages ?? [];
      const list: PromoMessage[] = rawList.filter(
        (m: unknown) =>
          m != null &&
          typeof m === "object" &&
          "id" in m &&
          "message" in m &&
          typeof (m as PromoMessage).id === "string" &&
          typeof (m as PromoMessage).message === "string"
      );
      let dismissed: string[] = [];
      try {
        dismissed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
        if (!Array.isArray(dismissed)) dismissed = [];
      } catch {
        dismissed = [];
      }
      const dismissedSet = new Set(dismissed.filter((x): x is string => typeof x === "string"));
      const next = list.filter((m) => m.message.trim() && !dismissedSet.has(m.id));
      if (next.length === 0) return;
      shownIdsRef.current = next.map((m) => m.id);
      setMessages(next);
      setOpen(true);
    } catch {
      /* ignore */
    }
  }, [bootstrap.status, bootstrap.data]);

  const persistDismiss = React.useCallback(() => {
    try {
      let dismissed: string[] = [];
      try {
        dismissed = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
        if (!Array.isArray(dismissed)) dismissed = [];
      } catch {
        dismissed = [];
      }
      const setIds = new Set([
        ...dismissed.filter((x): x is string => typeof x === "string"),
        ...shownIdsRef.current,
      ]);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...setIds]));
    } catch {
      /* ignore */
    }
  }, []);

  const handleOpenChange = React.useCallback(
    (v: boolean) => {
      if (!v) persistDismiss();
      setOpen(v);
    },
    [persistDismiss]
  );

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>عروض وتنبيهات</DialogTitle>
        </DialogHeader>
        <ul className="list-disc space-y-3 pr-5 text-sm leading-relaxed text-foreground">
          {messages.map((m) => (
            <li key={m.id} className="whitespace-pre-wrap">
              {m.message}
            </li>
          ))}
        </ul>
        <DialogFooter className="sm:justify-start">
          <Button type="button" onClick={() => handleOpenChange(false)}>
            إغلاق
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
