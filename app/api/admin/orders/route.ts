import { NextRequest } from "next/server";
import { OrderStatus, Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { placeOrder } from "@/lib/checkout/place-order";
import { assignOrderToGovernorate } from "@/lib/rerouting/assign";
import { invalidateAnalyticsCache } from "@/lib/cache/analytics";
import {
  parseOrderLineItems,
  parsePaymentMethod,
  resolveOrderCheckoutAddress,
} from "@/lib/admin/order-create";

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
    statusParam && ORDER_STATUSES.includes(statusParam as OrderStatus)
      ? (statusParam as OrderStatus)
      : undefined;
  const qRaw = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const q = qRaw.length > 0 ? qRaw : undefined;
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const searchWhere: Prisma.OrderWhereInput | undefined = q
    ? {
      OR: [
        { id: { contains: q, mode: "insensitive" } },
        { user: { name: { contains: q, mode: "insensitive" } } },
        { user: { phone: { contains: q, mode: "insensitive" } } },
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
      },
    }),
    prisma.order.count({ where }),
  ]);

  return apiSuccess({ orders, total, limit, offset });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) return apiBadRequest("العميل مطلوب");

  const user = await prisma.user.findFirst({
    where: { id: userId, role: "CUSTOMER" },
    select: { id: true },
  });
  if (!user) return apiBadRequest("العميل غير موجود");

  const itemsParsed = parseOrderLineItems(body.items);
  if (!itemsParsed.ok) return apiBadRequest(itemsParsed.message);

  const paymentParsed = parsePaymentMethod(body.paymentMethod);
  if (!paymentParsed.ok) return apiBadRequest(paymentParsed.message);

  const addressResolved = await resolveOrderCheckoutAddress({
    userId,
    savedAddressId: typeof body.savedAddressId === "string" ? body.savedAddressId.trim() : undefined,
    address: body.address,
  });
  if (!addressResolved.ok) return apiBadRequest(addressResolved.message);

  const adminNotes =
    typeof body.adminNotes === "string" && body.adminNotes.trim()
      ? body.adminNotes.trim()
      : "طلب من لوحة الإدارة";

  const result = await placeOrder({
    userId,
    address: addressResolved.address,
    paymentMethod: paymentParsed.method,
    couponCode: typeof body.couponCode === "string" ? body.couponCode.trim() || null : null,
    lines: itemsParsed.items,
    skipCartClear: true,
    adminNotes,
  });

  if (!result.success) {
    return apiBadRequest(result.error, {
      code: result.code,
      ...(result.outOfStockItems ? { outOfStockItems: result.outOfStockItems } : {}),
    });
  }

  try {
    await assignOrderToGovernorate(result.orderId);
  } catch (e) {
    console.error("[admin/orders] Governorate rerouting failed:", e);
  }

  await invalidateAnalyticsCache();

  return apiSuccess(
    { orderId: result.orderId, status: result.status },
    "تم إنشاء الطلب",
    201
  );
}
