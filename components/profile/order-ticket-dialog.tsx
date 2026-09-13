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
import { parseJsonResponse } from "@/lib/api/parse-json";
import { useToast } from "@/hooks/use-toast";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";
import { ORDER_TICKET_SUBJECTS, ORDER_TICKET_SUBJECT_LABELS } from "@/lib/constants/order-ticket";
import type { OrderTicket, TicketSubject } from "./order-ticket-types";
import { cn } from "@/lib/utils";

const inkButtonClass = "h-12 rounded-none bg-[hsl(228_40%_14%)] text-papyrus hover:bg-[hsl(228_40%_20%)]";
const outlineButtonClass = "h-12 rounded-none border-[hsl(228_40%_14%)] text-[hsl(228_40%_14%)]";

const BODY_MIN = 10;
const BODY_MAX = 1000;

/**
 * "سؤال عن الطلب" dialog (backlog 6.5a) — the customer's only path to ask about an order or
 * request a change, since customers do not cancel orders from the site (04-decisions.md
 * 2026-09-13). Subject chips are a real `radiogroup` with roving tabindex/arrow keys per the
 * design system's ARIA-pattern rule.
 */
export function OrderTicketDialog({
  open,
  onOpenChange,
  orderId,
  orderIdLabel,
  defaultPhone,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderIdLabel: string;
  defaultPhone: string;
  onCreated: (ticket: OrderTicket) => void;
}) {
  const { toast } = useToast();
  const [subject, setSubject] = React.useState<TicketSubject | null>(null);
  const [body, setBody] = React.useState("");
  const [phone, setPhone] = React.useState(defaultPhone);
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<{ subject?: string; body?: string; phone?: string }>({});
  const radioRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  // Reset only on the closed → open transition. `defaultPhone` arrives asynchronously from
  // `/api/auth/me`; if it resolves after the customer has started typing, re-running this reset
  // would silently wipe their subject and message (verifier finding, 6.5a). The phone field is
  // filled in separately below, and only while it is still empty.
  const defaultPhoneRef = React.useRef(defaultPhone);
  defaultPhoneRef.current = defaultPhone;
  React.useEffect(() => {
    if (open) {
      setSubject(null);
      setBody("");
      setPhone(defaultPhoneRef.current);
      setErrors({});
      setSubmitting(false);
    }
  }, [open]);
  React.useEffect(() => {
    if (open && defaultPhone) setPhone((current) => (current === "" ? defaultPhone : current));
  }, [open, defaultPhone]);

  const moveFocus = (fromIndex: number, delta: 1 | -1) => {
    const count = ORDER_TICKET_SUBJECTS.length;
    const nextIndex = (fromIndex + delta + count) % count;
    radioRefs.current[nextIndex]?.focus();
    setSubject(ORDER_TICKET_SUBJECTS[nextIndex]);
  };

  const validate = () => {
    const nextErrors: { subject?: string; body?: string; phone?: string } = {};
    if (!subject) nextErrors.subject = "الرجاء اختيار موضوع السؤال";
    const trimmedBody = body.trim();
    if (trimmedBody.length < BODY_MIN || trimmedBody.length > BODY_MAX) {
      nextErrors.body = `الرسالة يجب أن تكون بين ${BODY_MIN} و${BODY_MAX} حرفًا`;
    }
    if (!normalizeEgyptMobilePhone(phone)) {
      nextErrors.phone = EGYPT_MOBILE_ERROR_MESSAGE;
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || !subject) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/profile/orders/${orderId}/ticket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ subject, body: body.trim(), contactPhone: phone }),
      });
      const json = await parseJsonResponse<{ success?: boolean; data?: OrderTicket; error?: { message: string } }>(
        res
      );
      if (res.ok && json?.success && json.data) {
        toast({ title: "تم إرسال سؤالك" });
        onCreated(json.data);
        onOpenChange(false);
      } else {
        toast({ title: json?.error?.message ?? "تعذر إرسال السؤال", variant: "destructive" });
      }
    } catch {
      toast({ title: "تعذر إرسال السؤال", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full rounded-none border border-[rgba(21,26,53,.16)] bg-[#FFFDFA] p-7 sm:max-w-[560px] sm:p-8">
        <DialogHeader className="text-start sm:text-start">
          <DialogTitle className="font-amiri text-2xl font-bold text-[#151A35]">
            سؤال عن الطلب{" "}
            <span className="font-archivo text-lg font-semibold" style={{ direction: "ltr" }}>
              #{orderIdLabel}
            </span>
          </DialogTitle>
          <DialogDescription className="text-[13px] text-[#8A8C9A]">
            نرد خلال يوم عمل. ستجد الرد هنا تحت الطلب.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <span id="ticket-subject-label" className="text-[13px] font-medium text-[rgba(21,26,53,.8)]">
            موضوع السؤال
          </span>
          <div
            role="radiogroup"
            aria-labelledby="ticket-subject-label"
            className="flex flex-wrap gap-2"
          >
            {ORDER_TICKET_SUBJECTS.map((s, i) => {
              const selected = subject === s;
              return (
                <button
                  key={s}
                  ref={(el) => {
                    radioRefs.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected || (subject === null && i === 0) ? 0 : -1}
                  onClick={() => setSubject(s)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                      e.preventDefault();
                      moveFocus(i, 1);
                    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                      e.preventDefault();
                      moveFocus(i, -1);
                    }
                  }}
                  className={cn(
                    "relative flex h-9 items-center border px-4 text-[13.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500 focus-visible:ring-offset-2",
                    selected
                      ? "border-[#151A35] font-medium text-[#151A35] after:absolute after:bottom-[3px] after:inset-x-3 after:h-px after:bg-gold-500"
                      : "border-[rgba(21,26,53,.16)] text-[rgba(21,26,53,.8)]"
                  )}
                >
                  {ORDER_TICKET_SUBJECT_LABELS[s]}
                </button>
              );
            })}
          </div>
          {errors.subject && (
            <span className="text-[12.5px] text-[#A83A2A]" role="alert">
              {errors.subject}
            </span>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <label htmlFor="ticket-body" className="text-[13px] font-medium text-[rgba(21,26,53,.8)]">
            رسالتك
          </label>
          <textarea
            id="ticket-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className={cn(
              "border bg-white p-3 text-[15px] leading-[1.6] text-[#151A35] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
              errors.body ? "border-[#A83A2A]" : "border-[rgba(21,26,53,.16)] focus:border-gold-500"
            )}
          />
          {errors.body ? (
            <span className="text-[12.5px] text-[#A83A2A]" role="alert">
              {errors.body}
            </span>
          ) : (
            <span className="text-[12px] text-[#8A8C9A]">
              لا حاجة لكتابة رقم الطلب أو بياناتك — نراها مع الرسالة.
            </span>
          )}
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <label htmlFor="ticket-phone" className="text-[13px] font-medium text-[rgba(21,26,53,.8)]">
            رقم للتواصل
          </label>
          <input
            id="ticket-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ direction: "ltr" }}
            className={cn(
              "h-12 border bg-white px-3.5 font-archivo text-[15px] text-[#151A35] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500",
              errors.phone ? "border-[#A83A2A]" : "border-[rgba(21,26,53,.16)] focus:border-gold-500"
            )}
          />
          {errors.phone && (
            <span className="text-[12.5px] text-[#A83A2A]" role="alert">
              {errors.phone}
            </span>
          )}
        </div>

        <DialogFooter className="mt-6 border-t border-[rgba(21,26,53,.09)] pt-5 sm:justify-start">
          <Button type="button" className={inkButtonClass} onClick={handleSubmit} disabled={submitting}>
            {submitting ? "جارٍ الإرسال…" : "إرسال السؤال"}
          </Button>
          <Button type="button" variant="outline" className={outlineButtonClass} onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
