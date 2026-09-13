import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import {
  apiSuccess,
  apiBadRequest,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
} from "@/lib/api/response";
import { close } from "@/lib/tickets/order-ticket";

/**
 * GET /api/admin/order-tickets/[id] — the thread plus the order summary the thread page needs
 * (backlog 6.5b): order id/status/total/createdAt/shipping address/items count, alongside the
 * ticket and its messages ascending.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { id } = await params;
  const ticket = await prisma.orderTicket.findUnique({
    where: { id },
    include: {
      user: { select: { name: true, phone: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!ticket) return apiNotFound("السؤال غير موجود");

  // Fetched separately from the ticket (rather than a nested `include`) so the order summary
  // and its item count are independent, simple queries — easier to reason about than a nested
  // relation + `_count` combination for what is, here, always a 1:1 lookup by id.
  const order = await prisma.order.findUnique({
    where: { id: ticket.orderId },
    select: {
      id: true,
      status: true,
      totalPiastres: true,
      createdAt: true,
      shippingAddress: true,
      _count: { select: { items: true } },
    },
  });
  if (!order) return apiNotFound("الطلب غير موجود");

  const { user, ...rest } = ticket;
  return apiSuccess({
    ...rest,
    customerName: user?.name ?? null,
    customerPhone: user?.phone ?? "",
    order: {
      id: order.id,
      status: order.status,
      totalPiastres: order.totalPiastres,
      createdAt: order.createdAt,
      shippingAddress: order.shippingAddress,
      itemsCount: order._count.items,
    },
  });
}

/**
 * PATCH /api/admin/order-tickets/[id] — `{ status: "CLOSED" | "OPEN" }`, the admin's close/
 * reopen action. Reopening clears `closedAt` the same way the customer's reopening-by-message
 * path does.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const { id } = await params;
  const ticket = await prisma.orderTicket.findUnique({ where: { id }, select: { id: true } });
  if (!ticket) return apiNotFound("السؤال غير موجود");

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  if (payload.status !== "CLOSED" && payload.status !== "OPEN") {
    return apiBadRequest("قيمة الحالة غير صالحة");
  }

  const data =
    payload.status === "CLOSED"
      ? close()
      : { status: "OPEN" as const, closedAt: null };

  const updated = await prisma.orderTicket.update({
    where: { id: ticket.id },
    data,
    include: {
      user: { select: { name: true, phone: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  const { user, ...rest } = updated;
  return apiSuccess({ ...rest, customerName: user?.name ?? null, customerPhone: user?.phone ?? "" });
}
