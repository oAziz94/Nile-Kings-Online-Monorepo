import { NextRequest } from "next/server";
import type { OrderTicketStatus, Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized, apiForbidden } from "@/lib/api/response";

const STATUS_VALUES: OrderTicketStatus[] = ["OPEN", "ANSWERED", "CLOSED"];

function excerpt(body: string, max = 140): string {
  const trimmed = body.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * GET /api/admin/order-tickets — the inbox list (backlog 6.5b). `status` is one of
 * OPEN/ANSWERED/CLOSED/all (default all); `q` matches the order id suffix, the customer's
 * phone or name; cursor pagination (`cursor`/`take`, default 25) mirrors the customer orders
 * list's pattern. `counts` in the same response drive the inbox's three tabs and are computed
 * over the same `q` filter but independent of the selected status tab, so the badges update as
 * the admin searches (same shape as the partner orders stage tabs).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status") ?? undefined;
  const status =
    statusParam && (STATUS_VALUES as string[]).includes(statusParam)
      ? (statusParam as OrderTicketStatus)
      : undefined;
  const cursor = searchParams.get("cursor");
  const takeParam = searchParams.get("take");
  const take = Math.min(100, Math.max(1, Number.parseInt(takeParam ?? "25", 10) || 25));

  const qRaw = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const q = qRaw.length > 0 ? qRaw : undefined;

  const searchWhere: Prisma.OrderTicketWhereInput | undefined = q
    ? {
        OR: [
          { orderId: { contains: q, mode: "insensitive" } },
          { user: { name: { contains: q, mode: "insensitive" } } },
          { user: { phone: { contains: q, mode: "insensitive" } } },
        ],
      }
    : undefined;

  const where: Prisma.OrderTicketWhereInput = {
    ...(status ? { status } : {}),
    ...(searchWhere ?? {}),
  };

  const [tickets, openCount, answeredCount, closedCount] = await Promise.all([
    prisma.orderTicket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: { select: { name: true, phone: true } },
        messages: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.orderTicket.count({ where: { status: "OPEN", ...(searchWhere ?? {}) } }),
    prisma.orderTicket.count({ where: { status: "ANSWERED", ...(searchWhere ?? {}) } }),
    prisma.orderTicket.count({ where: { status: "CLOSED", ...(searchWhere ?? {}) } }),
  ]);

  const hasMore = tickets.length > take;
  const pageRows = hasMore ? tickets.slice(0, take) : tickets;
  const nextCursor = hasMore ? pageRows[pageRows.length - 1].id : null;

  const rows = pageRows.map((ticket) => {
    const lastMessage = ticket.messages[0] ?? null;
    const lastCustomerMessage = ticket.messages.find((m) => m.authorRole === "CUSTOMER") ?? null;
    return {
      id: ticket.id,
      orderId: ticket.orderId,
      orderLabel: `#${ticket.orderId.slice(-8).toUpperCase()}`,
      customerName: ticket.user?.name ?? null,
      customerPhone: ticket.user?.phone ?? "",
      subject: ticket.subject,
      status: ticket.status,
      lastMessageExcerpt: lastMessage ? excerpt(lastMessage.body) : "",
      lastMessageAuthorRole: lastMessage?.authorRole ?? null,
      lastMessageAt: lastMessage?.createdAt ?? ticket.createdAt,
      createdAt: ticket.createdAt,
      // Time since the last CUSTOMER message, meaningful while the ticket is OPEN (the admin
      // hasn't replied yet); null once answered/closed.
      waitingSinceAt: ticket.status === "OPEN" ? lastCustomerMessage?.createdAt ?? ticket.createdAt : null,
    };
  });

  return apiSuccess({
    tickets: rows,
    nextCursor,
    counts: { open: openCount, answered: answeredCount, closed: closedCount },
  });
}
