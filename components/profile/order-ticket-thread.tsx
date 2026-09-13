"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { parseJsonResponse } from "@/lib/api/parse-json";
import { useToast } from "@/hooks/use-toast";
import { formatRelativeTimeAr } from "@/lib/format-relative-time-ar";
import {
  getOrderTicketStatusLabel,
  getOrderTicketSubjectLabel,
  ORDER_TICKET_STATUS_COLORS,
} from "@/lib/constants/order-ticket";
import type { OrderTicket } from "./order-ticket-types";

const BODY_MIN = 10;
const BODY_MAX = 1000;

function TicketStatusPill({ status }: { status: OrderTicket["status"] }) {
  const color = ORDER_TICKET_STATUS_COLORS[status];
  return (
    <span className="inline-flex items-center gap-[7px] text-[13px] font-medium" style={{ color }}>
      <i aria-hidden="true" className="inline-block h-[7px] w-[7px] rounded-full" style={{ background: color }} />
      {getOrderTicketStatusLabel(status)}
    </span>
  );
}

/**
 * The thread panel under an expanded order (backlog 6.5a) — customer bubbles ivory at the
 * inline start, admin bubbles paper with a gold inline-end edge, at the inline end (matching
 * `ticketThread` in `design-canvas/account/build.mjs`). `aria-live="polite"` on the message
 * list so a fetched admin reply is announced.
 */
export function OrderTicketThread({
  orderId,
  ticket,
  onUpdated,
}: {
  orderId: string;
  ticket: OrderTicket;
  onUpdated: (ticket: OrderTicket) => void;
}) {
  const { toast } = useToast();
  const [reply, setReply] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [closing, setClosing] = React.useState(false);
  const [replyError, setReplyError] = React.useState<string | null>(null);

  const sendReply = async () => {
    const trimmed = reply.trim();
    if (trimmed.length < BODY_MIN || trimmed.length > BODY_MAX) {
      setReplyError(`الرسالة يجب أن تكون بين ${BODY_MIN} و${BODY_MAX} حرفًا`);
      return;
    }
    setReplyError(null);
    setSending(true);
    try {
      const res = await fetch(`/api/profile/orders/${orderId}/ticket/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: trimmed }),
      });
      const json = await parseJsonResponse<{ success?: boolean; data?: OrderTicket; error?: { message: string } }>(
        res
      );
      if (res.ok && json?.success && json.data) {
        onUpdated(json.data);
        setReply("");
      } else {
        toast({ title: json?.error?.message ?? "تعذر إرسال الرد", variant: "destructive" });
      }
    } catch {
      toast({ title: "تعذر إرسال الرد", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const closeTicket = async () => {
    setClosing(true);
    try {
      const res = await fetch(`/api/profile/orders/${orderId}/ticket`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: "CLOSED" }),
      });
      const json = await parseJsonResponse<{ success?: boolean; data?: OrderTicket; error?: { message: string } }>(
        res
      );
      if (res.ok && json?.success && json.data) {
        onUpdated(json.data);
      } else {
        toast({ title: json?.error?.message ?? "تعذر إغلاق السؤال", variant: "destructive" });
      }
    } catch {
      toast({ title: "تعذر إغلاق السؤال", variant: "destructive" });
    } finally {
      setClosing(false);
    }
  };

  return (
    <section className="flex flex-col gap-[18px] border border-[rgba(21,26,53,.16)] bg-[#FFFDFA] p-6 sm:p-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-amiri text-xl font-bold text-[#151A35]">سؤالك عن الطلب</h3>
          <span className="inline-flex h-[22px] items-center border border-[rgba(21,26,53,.16)] px-2 text-[12px] font-medium text-[rgba(21,26,53,.8)]">
            {getOrderTicketSubjectLabel(ticket.subject)}
          </span>
        </div>
        <TicketStatusPill status={ticket.status} />
      </header>

      <div aria-live="polite" className="flex flex-col gap-3.5">
        {ticket.messages.map((m) => {
          const isCustomer = m.authorRole === "CUSTOMER";
          return (
            <div key={m.id} className={`flex flex-col gap-1.5 ${isCustomer ? "items-start" : "items-end"}`}>
              <span className="text-[12px] text-[#8A8C9A]">
                {isCustomer ? "أنت" : "خدمة عملاء ملوك النيل"} · {formatRelativeTimeAr(m.createdAt)}
              </span>
              <p
                className="m-0 max-w-[78%] whitespace-pre-wrap px-4 py-3 text-[14px] leading-[1.7]"
                style={
                  isCustomer
                    ? { background: "#F7F4EE", border: "1px solid rgba(21,26,53,.09)" }
                    : {
                        background: "#FFFDFA",
                        border: "1px solid rgba(21,26,53,.16)",
                        borderInlineEnd: "2px solid hsl(var(--gold-500))",
                      }
                }
              >
                {m.body}
              </p>
            </div>
          );
        })}
      </div>

      {ticket.status === "CLOSED" && (
        <p className="m-0 text-[13px] text-[#8A8C9A]">أُغلق السؤال — يمكنك الكتابة لإعادة فتحه.</p>
      )}

      <div className="flex flex-col items-stretch gap-2.5 border-t border-[rgba(21,26,53,.09)] pt-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor={`ticket-reply-${ticket.id}`} className="sr-only">
            اكتب ردًا
          </label>
          <input
            id={`ticket-reply-${ticket.id}`}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="اكتب ردًا…"
            className="h-12 flex-1 border border-[rgba(21,26,53,.16)] bg-white px-3.5 text-[14px] text-[#151A35] placeholder:text-[#8A8C9A] focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
          />
          {replyError && (
            <span className="text-[12.5px] text-[#A83A2A]" role="alert">
              {replyError}
            </span>
          )}
        </div>
        <Button
          type="button"
          className="h-12 rounded-none bg-[#151A35] text-papyrus hover:bg-[#1f2749]"
          onClick={sendReply}
          disabled={sending}
        >
          {sending ? "جارٍ الإرسال…" : "إرسال"}
        </Button>
        {ticket.status !== "CLOSED" && (
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-none border-[rgba(21,26,53,.16)] text-[#151A35]"
            onClick={closeTicket}
            disabled={closing}
          >
            {closing ? "جارٍ الإغلاق…" : "إغلاق السؤال"}
          </Button>
        )}
      </div>
    </section>
  );
}
