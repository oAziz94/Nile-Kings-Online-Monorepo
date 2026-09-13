import { NextRequest } from "next/server";
import { OrderStatus, Prisma } from "@prisma/client";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { computeOrderSla, SLA_ELIGIBLE_STATUSES, type PartnerSlaHours } from "@/lib/orders/order-sla";

const ORDER_STATUSES: OrderStatus[] = [
  "CREATED",
  "CONFIRMED",
  "PROCESSING",
  "READY_TO_SHIP",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
];

/**
 * Backlog 5.3 — extended for the الطلبات pipeline: `stage` tabs (reuses the existing
 * `status` query param — comma-separated multi-status deep links from the product
 * variant "عرض الطلبات" link, `products.md`, still work unchanged), `governorate`,
 * `payment`, `from`/`to` (createdAt range), `overdue=1` (SLA-based, replaces the old
 * hard-coded 24h rule everywhere — see `lib/orders/order-sla.ts`), and one `groupBy` for
 * the tab counts. `routedOrders`/routing status is dropped from the response entirely —
 * "routing status removed from the table and detail" (backlog 5.3).
 */
async function overdueOrderIds(
  partnerId: string,
  partnerSla: PartnerSlaHours,
  scopeStatuses: OrderStatus[]
): Promise<Set<string>> {
  const eligible = scopeStatuses.filter((s) => (SLA_ELIGIBLE_STATUSES as readonly string[]).includes(s));
  if (eligible.length === 0) return new Set();

  const candidates = await prisma.order.findMany({
    where: { assignedPartnerId: partnerId, status: { in: eligible } },
    select: { id: true, status: true, createdAt: true },
  });
  if (candidates.length === 0) return new Set();

  const ids = candidates.map((c) => c.id);
  const latestRows = await prisma.orderAuditLog.groupBy({
    by: ["orderId"],
    where: { orderId: { in: ids } },
    _max: { createdAt: true },
  });
  const latestMap = new Map(latestRows.map((r) => [r.orderId, r._max.createdAt]));

  const now = new Date();
  const overdue = new Set<string>();
  for (const c of candidates) {
    const since = latestMap.get(c.id) ?? c.createdAt;
    const sla = computeOrderSla({ status: c.status, since: since!, partner: partnerSla, now });
    if (sla.applicable && sla.overdue) overdue.add(c.id);
  }
  return overdue;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUniqueOrThrow({
      where: { id: user.partnerId },
      select: { confirmSlaHours: true, shipSlaHours: true },
    });

    const { searchParams } = new URL(req.url);
    const statusParam = (searchParams.get("status") ?? searchParams.get("stage") ?? "").trim();
    const statuses = statusParam
      .split(",")
      .map((value) => value.trim())
      .filter((value): value is OrderStatus => ORDER_STATUSES.includes(value as OrderStatus));
    const status: Prisma.OrderWhereInput["status"] =
      statuses.length > 1 ? { in: statuses } : statuses.length === 1 ? statuses[0] : undefined;
    const variantId = (searchParams.get("variantId") ?? "").trim() || undefined;
    const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
    const governorate = (searchParams.get("governorate") ?? "").trim() || undefined;
    const payment = (searchParams.get("payment") ?? "").trim() || undefined;
    const fromRaw = (searchParams.get("from") ?? "").trim();
    const toRaw = (searchParams.get("to") ?? "").trim();
    const overdueOnly = (searchParams.get("overdue") ?? "").trim() === "1";
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 25) || 25));
    const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);

    const createdAtRange: Prisma.DateTimeFilter | undefined =
      fromRaw || toRaw
        ? {
            ...(fromRaw && !Number.isNaN(Date.parse(fromRaw)) ? { gte: new Date(fromRaw) } : {}),
            ...(toRaw && !Number.isNaN(Date.parse(toRaw))
              ? { lte: new Date(new Date(toRaw).getTime() + 24 * 3_600_000 - 1) }
              : {}),
          }
        : undefined;

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

    // Every filter except `status` itself — reused for the tab counts (one groupBy) so the
    // counts reflect the search/governorate/payment/date filters currently in effect.
    const baseWhere: Prisma.OrderWhereInput = {
      assignedPartnerId: user.partnerId,
      ...(variantId ? { items: { some: { variantId } } } : {}),
      ...(governorate ? { shippingAddress: { path: ["governorate"], equals: governorate } } : {}),
      ...(payment ? { paymentMethod: payment } : {}),
      ...(createdAtRange ? { createdAt: createdAtRange } : {}),
      ...(searchWhere ?? {}),
    };

    // With the overdue toggle on, both the rows and the tab counts are restricted to the
    // overdue set (computed across every SLA-eligible stage, then narrowed by `status`), so a
    // tab never advertises more orders than the list will show.
    let countsWhere: Prisma.OrderWhereInput = baseWhere;
    if (overdueOnly) {
      const overdueIds = await overdueOrderIds(user.partnerId, partner, [...SLA_ELIGIBLE_STATUSES]);
      countsWhere = { ...baseWhere, id: { in: Array.from(overdueIds) } };
    }
    const where: Prisma.OrderWhereInput = { ...countsWhere, ...(status ? { status } : {}) };

    const [orders, total, groups] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, phone: true, name: true } },
          items: { select: { quantity: true } },
        },
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ["status"], where: countsWhere, _count: { _all: true } }),
    ]);

    // Latest audit row per order on this page — drives the "منذ" column and the overdue pill.
    const orderIds = orders.map((o) => o.id);
    const latestRows = orderIds.length
      ? await prisma.orderAuditLog.groupBy({
          by: ["orderId"],
          where: { orderId: { in: orderIds } },
          _max: { createdAt: true },
        })
      : [];
    const latestMap = new Map(latestRows.map((r) => [r.orderId, r._max.createdAt]));

    const now = new Date();
    const rows = orders.map((o) => {
      const since = latestMap.get(o.id) ?? o.createdAt;
      const sla = computeOrderSla({ status: o.status, since: since!, partner, now });
      const itemCount = o.items.reduce((sum, i) => sum + i.quantity, 0);
      return {
        ...o,
        items: undefined,
        itemCount,
        statusSince: since,
        overdue: sla.applicable && sla.overdue,
      };
    });

    const counts: Record<string, number> = Object.fromEntries(ORDER_STATUSES.map((s) => [s, 0]));
    let allCount = 0;
    for (const g of groups) {
      counts[g.status] = g._count._all;
      allCount += g._count._all;
    }

    return apiSuccess({
      orders: rows,
      total,
      limit,
      offset,
      counts,
      allCount,
    });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
