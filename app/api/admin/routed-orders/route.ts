import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiUnauthorized, apiForbidden } from "@/lib/api/response";

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
  const status = searchParams.get("status") ?? undefined;
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const where = status
    ? { status: status as "ASSIGNED" | "NOTIFIED" | "ACCEPTED" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED" | "UNROUTED" }
    : {};

  const [routedOrders, total] = await Promise.all([
    prisma.routedOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        order: { select: { id: true, totalPiastres: true, createdAt: true } },
        partner: { select: { id: true, name: true, phone: true, partnerType: true } },
      },
    }),
    prisma.routedOrder.count({ where }),
  ]);

  const ordersById = new Map(
    (await prisma.order.findMany({
      where: { id: { in: routedOrders.map((r) => r.orderId) } },
      include: { user: { select: { phone: true, name: true } } },
    })).map((o) => [o.id, o])
  );

  const list = routedOrders.map((r) => ({
    ...r,
    orderNumber: r.order?.id?.slice(-8) ?? r.orderId.slice(-8),
    customerName: ordersById.get(r.orderId)?.user?.name ?? null,
    customerPhone: ordersById.get(r.orderId)?.user?.phone ?? null,
  }));

  return apiSuccess({ routedOrders: list, total, limit, offset });
}
