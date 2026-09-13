"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, ExternalLink, MapPin, MessageCircleQuestion, Package } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PanelCard } from "@/components/dashboard/panel-card";
import { StatusPill, type StatusPillTone } from "@/components/dashboard/status-pill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/shared/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatRelativeTimeAr } from "@/lib/format-relative-time-ar";
import { formatNumberEn } from "@/lib/format-en-numbers";
import { piastresToEgp } from "@/lib/catalog";
import { ORDER_STATUS_LABELS } from "@/lib/constants/order-status";
import {
  getOrderTicketStatusLabel,
  getOrderTicketSubjectLabel,
} from "@/lib/constants/order-ticket";
import { cn } from "@/lib/utils";

type TicketStatus = "OPEN" | "ANSWERED" | "CLOSED";

type Message = {
  id: string;
  authorRole: "CUSTOMER" | "ADMIN";
  authorUserId: string;
  body: string;
  createdAt: string;
};

type TicketDetail = {
  id: string;
  orderId: string;
  subject: string;
  status: TicketStatus;
  contactPhone: string;
  createdAt: string;
  closedAt: string | null;
  customerName: string | null;
  customerPhone: string;
  messages: Message[];
  order: {
    id: string;
    status: string;
    totalPiastres: number;
    createdAt: string;
    shippingAddress: Record<string, unknown> | null;
    itemsCount: number;
  };
};

const STATUS_TONE: Record<TicketStatus, StatusPillTone> = {
  OPEN: "warning",
  ANSWERED: "success",
  CLOSED: "neutral",
};

const BODY_MIN = 1;
const BODY_MAX = 2000;

function egp(piastres: number): string {
  return `${formatNumberEn(piastresToEgp(piastres))} ج.م`;
}

export default function AdminOrderTicketThreadPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const { toast } = useToast();

  const [ticket, setTicket] = React.useState<TicketDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reply, setReply] = React.useState("");
  const [replyError, setReplyError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [togglingStatus, setTogglingStatus] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/order-tickets/${id}`, { credentials: "include" });
      const json = await res.json();
      if (res.ok && json?.success) {
        setTicket(json.data);
        setLoadError(null);
      } else {
        setLoadError(json?.error?.message ?? "تعذر تحميل السؤال");
      }
    } catch {
      setLoadError("تعذر تحميل السؤال");
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => {
    if (id) load();
  }, [id, load]);

  const sendReply = React.useCallback(async () => {
    const trimmed = reply.trim();
    if (trimmed.length < BODY_MIN || trimmed.length > BODY_MAX) {
      setReplyError(`الرسالة يجب أن تكون بين ${BODY_MIN} و${BODY_MAX} حرفًا`);
      return;
    }
    setReplyError(null);
    setSending(true);
    try {
      const res = await fetch(`/api/admin/order-tickets/${id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      const json = await res.json();
      if (res.ok && json?.success) {
        setTicket((prev) => (prev ? { ...prev, ...json.data } : json.data));
        setReply("");
        toast({ title: "تم إرسال الرد" });
      } else {
        toast({ title: json?.error?.message ?? "تعذر إرسال الرد", variant: "destructive" });
      }
    } catch {
      toast({ title: "تعذر إرسال الرد", variant: "destructive" });
    } finally {
      setSending(false);
    }
  }, [id, reply, toast]);

  const toggleStatus = React.useCallback(
    async (nextStatus: "CLOSED" | "OPEN") => {
      setTogglingStatus(true);
      try {
        const res = await fetch(`/api/admin/order-tickets/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        });
        const json = await res.json();
        if (res.ok && json?.success) {
          setTicket((prev) => (prev ? { ...prev, ...json.data } : json.data));
          toast({ title: nextStatus === "CLOSED" ? "تم إغلاق السؤال" : "تمت إعادة فتح السؤال" });
        } else {
          toast({ title: json?.error?.message ?? "فشل التحديث", variant: "destructive" });
        }
      } catch {
        toast({ title: "فشل التحديث", variant: "destructive" });
      } finally {
        setTogglingStatus(false);
      }
    },
    [id, toast]
  );

  if (loading || !ticket) {
    if (loadError) {
      return (
        <div role="alert" className="rounded-xl border border-danger-text/30 bg-danger-bg p-4 text-sm text-danger-text">
          <p className="font-bold">{loadError}</p>
          <Button type="button" variant="outline" size="sm" className="mt-2 rounded-lg" onClick={load}>
            إعادة المحاولة
          </Button>
        </div>
      );
    }
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  }

  const addr = ticket.order.shippingAddress as Record<string, string> | undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`سؤال عن الطلب #${ticket.orderId.slice(-8).toUpperCase()}`}
        badge={
          <span className="inline-flex h-[22px] items-center rounded-full border border-stone-200 bg-stone-50 px-2.5 text-xs font-bold text-ink-soft">
            {getOrderTicketSubjectLabel(ticket.subject)}
          </span>
        }
        meta={<StatusPill tone={STATUS_TONE[ticket.status]}>{getOrderTicketStatusLabel(ticket.status)}</StatusPill>}
        actions={
          <>
            <Button asChild type="button" variant="outline" size="sm" className="rounded-full">
              <Link href={`/admin/orders/${ticket.orderId}`}>
                <ExternalLink className="h-3.5 w-3.5" />
                فتح الطلب
              </Link>
            </Button>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => router.back()}>
              <ArrowRight className="h-4 w-4" />
              رجوع
            </Button>
          </>
        }
      />

      <PanelCard title="ملخص الطلب" icon={<Package className="h-5 w-5 text-lapis-800" />}>
        <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-ink-soft">العميل</p>
            <p className="font-bold text-ink">{ticket.customerName ?? "عميل بدون اسم"}</p>
            <p dir="ltr" className="text-xs text-ink-soft">{ticket.customerPhone}</p>
          </div>
          <div>
            <p className="text-xs text-ink-soft">حالة الطلب</p>
            <p className="font-bold text-ink">{ORDER_STATUS_LABELS[ticket.order.status] ?? ticket.order.status}</p>
          </div>
          <div>
            <p className="text-xs text-ink-soft">الإجمالي · عدد القطع</p>
            <p className="font-bold text-ink">
              {egp(ticket.order.totalPiastres)} · {formatNumberEn(ticket.order.itemsCount)} قطعة
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-xs text-ink-soft">
              <MapPin className="h-3.5 w-3.5" />
              عنوان الشحن
            </p>
            <p className="font-bold text-ink">
              {addr ? [addr.governorate, addr.city, addr.area].filter(Boolean).join("، ") : "—"}
            </p>
          </div>
        </div>
      </PanelCard>

      <PanelCard title="المحادثة" icon={<MessageCircleQuestion className="h-5 w-5 text-lapis-800" />}>
        <div aria-live="polite" className="flex flex-col gap-3.5">
          {ticket.messages.map((m) => {
            const isCustomer = m.authorRole === "CUSTOMER";
            return (
              <div key={m.id} className={cn("flex flex-col gap-1.5", isCustomer ? "items-start" : "items-end")}>
                <span className="text-xs text-ink-soft">
                  {isCustomer ? "العميل" : "أنت"} · {formatRelativeTimeAr(m.createdAt)}
                </span>
                <p
                  className={cn(
                    "m-0 max-w-[78%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                    isCustomer
                      ? "border border-stone-200 bg-stone-50 text-ink"
                      : "border border-stone-200 bg-white text-ink [border-inline-end-width:2px] [border-inline-end-color:hsl(var(--gold-500))]"
                  )}
                >
                  {m.body}
                </p>
              </div>
            );
          })}
        </div>

        {ticket.status === "CLOSED" && (
          <p className="mt-3 text-[13px] text-ink-soft">هذا السؤال مغلق — الرد يعيد فتحه تلقائيًا.</p>
        )}

        <div className="mt-4 flex flex-col items-stretch gap-2.5 border-t border-stone-200 pt-4 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="admin-ticket-reply" className="text-sm font-bold text-ink">
              الرد على العميل
            </label>
            <textarea
              id="admin-ticket-reply"
              ref={textareaRef}
              value={reply}
              onChange={(e) => {
                setReply(e.target.value);
                if (replyError) setReplyError(null);
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  sendReply();
                }
              }}
              rows={3}
              placeholder="اكتب ردًا للعميل…"
              className="min-h-[88px] rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500"
              disabled={sending}
            />
            {replyError && (
              <span role="alert" className="text-xs text-danger-text">
                {replyError}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" className="rounded-full" onClick={sendReply} disabled={sending}>
              {sending ? "جاري الإرسال…" : "إرسال الرد"}
            </Button>
            {ticket.status === "CLOSED" ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => toggleStatus("OPEN")}
                disabled={togglingStatus}
              >
                {togglingStatus ? "جاري…" : "إعادة فتح"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => toggleStatus("CLOSED")}
                disabled={togglingStatus}
              >
                {togglingStatus ? "جاري…" : "إغلاق السؤال"}
              </Button>
            )}
          </div>
        </div>
      </PanelCard>
    </div>
  );
}
