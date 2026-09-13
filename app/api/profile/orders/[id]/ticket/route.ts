import { NextRequest } from "next/server";
import { requireCustomer } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  apiSuccess,
  apiBadRequest,
  apiUnauthorized,
  apiNotFound,
  apiConflict,
} from "@/lib/api/response";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";
import { ORDER_TICKET_SUBJECTS } from "@/lib/constants/order-ticket";
import type { OrderTicketSubject } from "@prisma/client";

const BODY_MIN = 10;
const BODY_MAX = 1000;

function isValidSubject(v: unknown): v is OrderTicketSubject {
  return typeof v === "string" && (ORDER_TICKET_SUBJECTS as string[]).includes(v);
}

/**
 * GET /api/profile/orders/[id]/ticket — the thread for the order's ticket (backlog 6.5a).
 * Ownership is through the order: a ticket belonging to another customer's order 404s, same as
 * an order that has no ticket at all — this endpoint never reveals whether an order exists for
 * a different customer.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  const { id } = await params;
  const order = await prisma.order.findFirst({ where: { id, userId: user.userId }, select: { id: true } });
  if (!order) return apiNotFound("الطلب غير موجود");

  const ticket = await prisma.orderTicket.findUnique({
    where: { orderId: id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!ticket) return apiNotFound("لا يوجد سؤال لهذا الطلب");

  return apiSuccess(ticket);
}

/**
 * POST /api/profile/orders/[id]/ticket — open a new ticket ("سؤال عن الطلب"). One thread per
 * order (`@@unique([orderId])`): a second POST is a 409, not a second ticket — the reply flow
 * lives at `.../ticket/messages`.
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

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const subject = payload.subject;
  if (!isValidSubject(subject)) {
    return apiBadRequest("يرجى اختيار موضوع السؤال");
  }

  const rawBody = typeof payload.body === "string" ? payload.body.trim() : "";
  if (rawBody.length < BODY_MIN || rawBody.length > BODY_MAX) {
    return apiBadRequest(`الرسالة يجب أن تكون بين ${BODY_MIN} و${BODY_MAX} حرفًا`);
  }

  const rawPhone = typeof payload.contactPhone === "string" ? payload.contactPhone : "";
  const contactPhone = normalizeEgyptMobilePhone(rawPhone);
  if (!contactPhone) {
    return apiBadRequest(EGYPT_MOBILE_ERROR_MESSAGE);
  }

  const existing = await prisma.orderTicket.findUnique({ where: { orderId: id }, select: { id: true } });
  if (existing) {
    return apiConflict("يوجد سؤال مفتوح بالفعل لهذا الطلب");
  }

  try {
    const ticket = await prisma.$transaction(async (tx) => {
      const created = await tx.orderTicket.create({
        data: {
          orderId: id,
          userId: user.userId,
          subject,
          contactPhone,
        },
      });
      await tx.orderTicketMessage.create({
        data: {
          ticketId: created.id,
          authorRole: "CUSTOMER",
          authorUserId: user.userId,
          body: rawBody,
        },
      });
      return tx.orderTicket.findUniqueOrThrow({
        where: { id: created.id },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
    });
    return apiSuccess(ticket, undefined, 201);
  } catch {
    // Unique-constraint race on `orderId` (two parallel POSTs) — the row-lock rule concerns
    // status transitions; a create race on a unique key is handled by the constraint itself.
    return apiConflict("يوجد سؤال مفتوح بالفعل لهذا الطلب");
  }
}

/**
 * PATCH /api/profile/orders/[id]/ticket — `{ status: "CLOSED" }` only. The customer's one
 * mutation on an existing ticket besides sending a message.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let user;
  try {
    user = await requireCustomer();
  } catch {
    return apiUnauthorized("يجب تسجيل الدخول");
  }

  const { id } = await params;
  const order = await prisma.order.findFirst({ where: { id, userId: user.userId }, select: { id: true } });
  if (!order) return apiNotFound("الطلب غير موجود");

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  if (payload.status !== "CLOSED") {
    return apiBadRequest("قيمة الحالة غير صالحة");
  }

  const ticket = await prisma.orderTicket.findUnique({ where: { orderId: id }, select: { id: true } });
  if (!ticket) return apiNotFound("لا يوجد سؤال لهذا الطلب");

  const updated = await prisma.orderTicket.update({
    where: { id: ticket.id },
    data: { status: "CLOSED", closedAt: new Date() },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  return apiSuccess(updated);
}
