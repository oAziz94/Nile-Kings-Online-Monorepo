/**
 * Order-ticket status machine (backlog 6.5a) — pure functions, no I/O, so the three status
 * transitions are covered by Vitest without a database. Callers (the customer API routes here,
 * the admin API in 6.5b) apply the returned status inside their own transaction.
 */
import type { OrderTicketStatus } from "@prisma/client";

/** A customer message always reopens the conversation for a reply: OPEN stays OPEN, ANSWERED
 * goes back to OPEN (the person who answered needs to see the new message), and a CLOSED
 * ticket reopens to OPEN too — the artboard's note ("أُغلق السؤال — يمكنك الكتابة لإعادة
 * فتحه") describes exactly this. */
export function nextStatusAfterCustomerMessage(current: OrderTicketStatus): OrderTicketStatus {
  void current;
  return "OPEN";
}

/** An admin reply always marks the ticket answered, regardless of its prior status. */
export function nextStatusAfterAdminMessage(current: OrderTicketStatus): OrderTicketStatus {
  void current;
  return "ANSWERED";
}

/** Closing sets CLOSED and returns the timestamp to store in `closedAt`. */
export function close(now: Date = new Date()): { status: OrderTicketStatus; closedAt: Date } {
  return { status: "CLOSED", closedAt: now };
}
