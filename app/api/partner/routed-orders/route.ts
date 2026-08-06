import { NextRequest } from "next/server";
import { OrderStatus, Prisma } from "@prisma/client";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";

const ORDER_STATUSES: OrderStatus[] = [
  "CREATED",
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

export async function GET(req: NextRequest) {
  try {
    const user = await requirePartner();
    const { searchParams } = new URL(req.url);
    const statusParam = (searchParams.get("status") ?? "").trim();
    const status =
      statusParam && ORDER_STATUSES.includes(statusParam as OrderStatus)
        ? (statusParam as OrderStatus)
        : undefined;
    const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 20) || 20));
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);

    const searchWhere: Prisma.OrderWhereInput | undefined = q
      ? {
          OR: [
            { id: { contains: q, mode: "insensitive" } },
            { user: { phone: { contains: q, mode: "insensitive" } } },
            { user: { name: { contains: q, mode: "insensitive" } } },
            {
              items: {
                some: {
                  OR: [
                    { productName: { contains: q, mode: "insensitive" } },
                    { variantName: { contains: q, mode: "insensitive" } },
                  ],
                },
              },
            },
          ],
        }
      : undefined;

    const where: Prisma.OrderWhereInput = {
      assignedPartnerId: user.partnerId,
      ...(status ? { status } : {}),
      ...(searchWhere ?? {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, phone: true, name: true } },
          items: { select: { id: true, productName: true, variantName: true, quantity: true, totalPiastres: true } },
          routedOrder: { select: { id: true, status: true, assignedAt: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    const routedOrders = await prisma.routedOrder.findMany({
      where: {
        partnerId: user.partnerId,
        ...(statusParam && !status ? { status: statusParam as never } : {}),
        ...(q
          ? {
              OR: [
                { orderId: { contains: q, mode: "insensitive" } },
                { order: { user: { phone: { contains: q, mode: "insensitive" } } } },
                { order: { user: { name: { contains: q, mode: "insensitive" } } } },
              ],
            }
          : {}),
      },
      include: {
        order: {
          include: {
            user: { select: { name: true, phone: true } },
            items: {
              select: {
                productName: true,
                variantName: true,
                quantity: true,
                totalPiastres: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return apiSuccess({
      orders,
      total,
      limit,
      offset,
      routedOrders: routedOrders.map((row) => ({
        ...row,
        orderNumber: row.orderId.slice(-8),
      })),
    });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
