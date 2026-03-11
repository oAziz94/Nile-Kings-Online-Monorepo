import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import {
  buildCourierXlsx,
  courierExportFilename,
  type OrderForCourierExport,
} from "@/lib/courier-export";

/** Parse YYYY-MM-DD and return start (00:00:00.000) and end (23:59:59.999) of that day in UTC. */
function parseDateRange(dateStr: string): { start: Date; end: Date } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!match) return null;
  const [, y, m, d] = match;
  const year = parseInt(y!, 10);
  const month = parseInt(m!, 10) - 1;
  const day = parseInt(d!, 10);
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  const start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return { start, end };
}

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
  const dateStr = searchParams.get("date") ?? "";
  const range = parseDateRange(dateStr);
  if (!range) {
    return apiBadRequest("المعامل date مطلوب بصيغة YYYY-MM-DD");
  }

  const { start, end } = range;

  const orders = await prisma.order.findMany({
    where: {
      status: "READY_TO_SHIP",
      exportedToCourierAt: null,
      createdAt: { gte: start, lte: end },
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

  const now = new Date();
  const orderIds = orders.map((o) => o.id);

  if (orderIds.length > 0) {
    await prisma.order.updateMany({
      where: { id: { in: orderIds } },
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
  const filename = courierExportFilename(start);

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
