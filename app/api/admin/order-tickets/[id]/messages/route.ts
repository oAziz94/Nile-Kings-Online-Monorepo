import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { nextStatusAfterAdminMessage } from "@/lib/tickets/order-ticket";

const BODY_MIN = 1;
const BODY_MAX = 2000;

/**
 * POST /api/admin/order-tickets/[id]/messages — an admin reply (backlog 6.5b). Always marks the
 * ticket ANSWERED via `nextStatusAfterAdminMessage` (the same pure function 6.5a's customer
 * routes use) and clears `closedAt` — the new status is never CLOSED, so a ticket the admin
 * replies to while it happened to be CLOSED reopens as ANSWERED, not CLOSED.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { id } = await params;
  const ticket = await prisma.orderTicket.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!ticket) return apiNotFound("السؤال غير موجود");

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const rawBody = typeof payload.body === "string" ? payload.body.trim() : "";
  if (rawBody.length < BODY_MIN || rawBody.length > BODY_MAX) {
    return apiBadRequest(`الرسالة يجب أن تكون بين ${BODY_MIN} و${BODY_MAX} حرفًا`);
  }

  const nextStatus = nextStatusAfterAdminMessage(ticket.status);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderTicketMessage.create({
      data: {
        ticketId: ticket.id,
        authorRole: "ADMIN",
        authorUserId: admin.userId,
        body: rawBody,
      },
    });
    return tx.orderTicket.update({
      where: { id: ticket.id },
      data: { status: nextStatus, closedAt: null },
      include: {
        user: { select: { name: true, phone: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
  });

  const { user, ...rest } = updated;
  return apiSuccess(
    { ...rest, customerName: user?.name ?? null, customerPhone: user?.phone ?? "" },
    undefined,
    201
  );
}
