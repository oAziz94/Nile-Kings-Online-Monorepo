import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";

const ORDER_STATUSES = ["CREATED", "CONFIRMED", "PROCESSING", "READY_TO_SHIP", "SHIPPED", "DELIVERED", "CANCELLED"] as const;

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, phone: true, name: true } },
      items: true,
    },
  });
  if (!order) return apiNotFound("الطلب غير موجود");
  return apiSuccess(order);
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const existing = await prisma.order.findUnique({ where: { id } });
  if (!existing) return apiNotFound("الطلب غير موجود");

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  if (!body.status || !ORDER_STATUSES.includes(body.status as (typeof ORDER_STATUSES)[number]))
    return apiBadRequest("status غير صالح: " + ORDER_STATUSES.join(", "));

  const order = await prisma.order.update({
    where: { id },
    data: { status: body.status as (typeof ORDER_STATUSES)[number] },
    include: {
      user: { select: { id: true, phone: true, name: true } },
      items: true,
    },
  });
  return apiSuccess(order);
}
