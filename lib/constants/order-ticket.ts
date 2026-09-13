/**
 * Order-ticket labels and status colours (backlog 6.5a — "سؤال عن الطلب" as an in-site ticket,
 * per 04-decisions.md 2026-09-13 "Account canvas round 2"). Lifted byte-for-byte from
 * `design-canvas/account/build.mjs`'s `TICKET_REASONS` / `TICKET_STATUS`. Colours use the
 * storefront's own tokens per 04-decisions.md 2026-09-13 "one gold on the storefront — the
 * token, not the canvas literal": OPEN is `hsl(var(--gold-500))`, not the canvas's `#B8902F`.
 */
import type { OrderTicketSubject, OrderTicketStatus } from "@prisma/client";

export const ORDER_TICKET_SUBJECTS: OrderTicketSubject[] = ["DELIVERY_DELAY", "ADDRESS_CHANGE"];

export const ORDER_TICKET_SUBJECT_LABELS: Record<OrderTicketSubject, string> = {
  DELIVERY_DELAY: "تأخير في التوصيل",
  ADDRESS_CHANGE: "تعديل العنوان أو الهاتف",
};

export function getOrderTicketSubjectLabel(subject: string): string {
  return ORDER_TICKET_SUBJECT_LABELS[subject as OrderTicketSubject] ?? subject;
}

export const ORDER_TICKET_STATUS_LABELS: Record<OrderTicketStatus, string> = {
  OPEN: "بانتظار الرد",
  ANSWERED: "تم الرد",
  CLOSED: "مغلقة",
};

export function getOrderTicketStatusLabel(status: string): string {
  return ORDER_TICKET_STATUS_LABELS[status as OrderTicketStatus] ?? status;
}

/** One status -> colour vocabulary, the tokens the storefront already ships (never the canvas's
 * raw `#B8902F` — see 04-decisions.md). Malachite/muted are plain hex like the orders screen's
 * own `ORDER_STATUS_COLORS` (those two have no site-wide CSS variable). */
export const ORDER_TICKET_STATUS_COLORS: Record<OrderTicketStatus, string> = {
  OPEN: "hsl(var(--gold-500))",
  ANSWERED: "#2F6B4C",
  CLOSED: "#8A8C9A",
};
