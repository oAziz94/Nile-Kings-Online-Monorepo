// Shared shapes for the order-ticket dialog/thread (backlog 6.5a) — kept separate from the
// orders page so both client components can import them without a cycle.
export type TicketSubject = "DELIVERY_DELAY" | "ADDRESS_CHANGE";
export type TicketStatus = "OPEN" | "ANSWERED" | "CLOSED";
export type TicketAuthorRole = "CUSTOMER" | "ADMIN";

export type TicketMessage = {
  id: string;
  authorRole: TicketAuthorRole;
  authorUserId: string;
  body: string;
  createdAt: string;
};

export type OrderTicket = {
  id: string;
  orderId: string;
  userId: string;
  subject: TicketSubject;
  status: TicketStatus;
  contactPhone: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  messages: TicketMessage[];
};
