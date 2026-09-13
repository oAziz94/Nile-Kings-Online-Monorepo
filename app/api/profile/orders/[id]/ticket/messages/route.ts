import { NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiNotFound } from "@/lib/api/response";
import { nextStatusAfterCustomerMessage } from "@/lib/tickets/order-ticket";

const BODY_MIN = 10;
const BODY_MAX = 1000;

/**
 * POST /api/profile/orders/[id]/ticket/messages — a customer reply. Always reopens the
 * conversation to OPEN via `nextStatusAfterCustomerMessage` (ANSWERED -> OPEN, and a CLOSED
 * ticket reopens too — the thread's reply box stays usable after closing, per the artboard's
 * "أُغلق السؤال — يمكنك الكتابة لإعادة فتحه" note).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  const { id } = await params;
  const order = await prisma.order.findFirst({ where: { id, userId: user.userId }, select: { id: true } });
  if (!order) return apiNotFound("الطلب غير موجود");

  const ticket = await prisma.orderTicket.findUnique({ where: { orderId: id }, select: { id: true, status: true } });
  if (!ticket) return apiNotFound("لا يوجد سؤال لهذا الطلب");

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

  const nextStatus = nextStatusAfterCustomerMessage(ticket.status);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.orderTicketMessage.create({
      data: {
        ticketId: ticket.id,
        authorRole: "CUSTOMER",
        authorUserId: user.userId,
        body: rawBody,
      },
    });
    return tx.orderTicket.update({
      where: { id: ticket.id },
      data: { status: nextStatus, ...(nextStatus === "OPEN" ? { closedAt: null } : {}) },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  });

  return apiSuccess(updated, undefined, 201);
}
