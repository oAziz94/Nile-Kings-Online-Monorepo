import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import {
  buildCourierXlsx,
  courierExportFilename,
  type OrderForCourierExport,
} from "@/lib/courier-export";
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const body = await req.json().catch(() => null);
  const orderIds: string[] = Array.isArray(body?.orderIds)
    ? body.orderIds.filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  if (orderIds.length === 0) {
    return apiBadRequest("يجب اختيار طلب واحد على الأقل للتصدير");
  }

  const orders = await prisma.order.findMany({
    where: {
      id: { in: orderIds },
      status: "READY_TO_SHIP",
    },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, phone: true, name: true } },
      items: {
        include: {
          variant: {
            select: { product: { select: { weightGrams: true } } },
          },
        },
      },
    },
  });

  if (orders.length === 0) {
    return apiBadRequest("لا توجد طلبات بحالة «جاهز للشحن» ضمن الطلبات المحددة");
  }

  const now = new Date();
  const exportedOrderIds = orders.map((o) => o.id);

  if (exportedOrderIds.length > 0) {
    await prisma.order.updateMany({
      where: { id: { in: exportedOrderIds } },
      data: { exportedToCourierAt: now },
    });
  }

  const forExport: OrderForCourierExport[] = orders.map((o) => ({
    id: o.id,
    totalPiastres: o.totalPiastres,
    paymentMethod: o.paymentMethod,
    shippingAddress: o.shippingAddress,
    user: { name: o.user.name, phone: o.user.phone },
    items: o.items.map((i) => ({
      productName: i.productName,
      variantName: i.variantName,
      quantity: i.quantity,
      weightGrams: i.variant?.product?.weightGrams ?? null,
    })),
  }));

  const buffer = buildCourierXlsx(forExport);
  const filename = courierExportFilename(now);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
    },
  });
}
