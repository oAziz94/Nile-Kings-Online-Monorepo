import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { placeOrder } from "@/lib/checkout/place-order";
import { assignOrderToGovernorate } from "@/lib/rerouting/assign";
import {
  parseOrderLineItems,
  parsePaymentMethod,
  resolveOrderCheckoutAddress,
} from "@/lib/admin/order-create";
import { ORDER_STAGE_STATUSES, parseStage, stageWhereClause } from "@/lib/admin/orders-list";
import { computeOrderSla, SLA_ELIGIBLE_STATUSES, type PartnerSlaHours } from "@/lib/orders/order-sla";
import { findOverdueAssignedOrders } from "@/lib/partner/today";

/**
 * GET /api/admin/orders — the network-wide pipeline (backlog 9.3 b): additive filters over
 * the v1 route (`partner=<id>|none`, `governorate`, `payment`, `overdue=1`, `days=7|30`),
 * `stage` (an `OrderStatus` or the pseudo-stage `UNASSIGNED`, `lib/admin/orders-list.ts`),
 * per-stage `counts` respecting every other filter, and `assignedPartner` per row.
 */
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
  const stage = parseStage(searchParams.get("stage") ?? searchParams.get("status"));
  const qRaw = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const q = qRaw.length > 0 ? qRaw : undefined;
  const partnerParam = (searchParams.get("partner") ?? "").trim() || undefined;
  const governorate = (searchParams.get("governorate") ?? "").trim() || undefined;
  const payment = (searchParams.get("payment") ?? "").trim() || undefined;
  const overdueOnly = (searchParams.get("overdue") ?? "").trim() === "1";
  const daysParam = (searchParams.get("days") ?? "").trim();
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const createdAtRange: Prisma.DateTimeFilter | undefined =
    daysParam === "7" || daysParam === "30"
      ? { gte: new Date(Date.now() - Number(daysParam) * 24 * 3_600_000) }
      : undefined;

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

  // Every filter except the stage tab itself — reused for the tab counts (rule: a tab never
  // advertises more orders than the list will show for the filters currently in effect).
  const baseWhere: Prisma.OrderWhereInput = {
    ...(partnerParam === "none" ? { assignedPartnerId: null } : partnerParam ? { assignedPartnerId: partnerParam } : {}),
    ...(governorate ? { shippingAddress: { path: ["governorate"], equals: governorate } } : {}),
    ...(payment ? { paymentMethod: payment } : {}),
    ...(createdAtRange ? { createdAt: createdAtRange } : {}),
    ...(searchWhere ?? {}),
  };

  let countsWhere: Prisma.OrderWhereInput = baseWhere;
  if (overdueOnly) {
    const overdueRows = await findOverdueAssignedOrders(
      partnerParam && partnerParam !== "none" ? { partnerId: partnerParam } : {}
    );
    countsWhere = { ...baseWhere, id: { in: overdueRows.map((r) => r.id) } };
  }

  const where: Prisma.OrderWhereInput = { ...countsWhere, ...stageWhereClause(stage) };

  const [orders, total, statusGroups, unassignedCount, allCount] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: {
        user: { select: { id: true, phone: true, name: true } },
        items: { select: { id: true, productName: true, variantName: true, quantity: true, totalPiastres: true } },
        assignedPartner: { select: { id: true, name: true, confirmSlaHours: true, shipSlaHours: true } },
      },
    }),
    prisma.order.count({ where }),
    prisma.order.groupBy({ by: ["status"], where: countsWhere, _count: { _all: true } }),
    prisma.order.count({ where: { ...countsWhere, ...stageWhereClause("UNASSIGNED") } }),
    prisma.order.count({ where: countsWhere }),
  ]);

  const orderIds = orders.map((o) => o.id);
  const latestRows = orderIds.length
    ? await prisma.orderAuditLog.groupBy({
        by: ["orderId"],
        where: { orderId: { in: orderIds }, event: { in: ["status_change", "confirmed"] } },
        _max: { createdAt: true },
      })
    : [];
  const latestMap = new Map(latestRows.map((r) => [r.orderId, r._max.createdAt]));

  const now = new Date();
  const rows = orders.map((o) => {
    const itemCount = o.items.reduce((sum, i) => sum + i.quantity, 0);
    const since = latestMap.get(o.id) ?? o.createdAt;
    let overdue = false;
    if (
      o.assignedPartner &&
      (SLA_ELIGIBLE_STATUSES as readonly string[]).includes(o.status)
    ) {
      const sla: PartnerSlaHours = {
        confirmSlaHours: o.assignedPartner.confirmSlaHours,
        shipSlaHours: o.assignedPartner.shipSlaHours,
      };
      const result = computeOrderSla({ status: o.status, since, partner: sla, now });
      overdue = result.applicable && result.overdue;
    }
    return {
      ...o,
      items: undefined,
      itemCount,
      statusSince: since,
      overdue,
      assignedPartner: o.assignedPartner ? { id: o.assignedPartner.id, name: o.assignedPartner.name } : null,
    };
  });

  const counts: Record<string, number> = Object.fromEntries(ORDER_STAGE_STATUSES.map((s) => [s, 0]));
  for (const g of statusGroups) counts[g.status] = g._count._all;
  counts.UNASSIGNED = unassignedCount;

  return apiSuccess({ orders: rows, total, limit, offset, counts, allCount });
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
    createdByAdmin: true,
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

  return apiSuccess(
    { orderId: result.orderId, status: result.status },
    "تم إنشاء الطلب",
    201
  );
}
