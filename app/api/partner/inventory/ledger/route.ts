import { NextRequest } from "next/server";
import { Prisma, InventoryLedgerReason } from "@prisma/client";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";

/**
 * Movements tab (backlog 5.4, `05-partner-portal-v2.md` §4.4): `GET
 * /api/partner/inventory/ledger?from&to&reason&variantId&page` reads `InventoryLedger`
 * scoped to the calling partner, newest first, page size 50, and returns a per-variant
 * running balance for the returned page.
 *
 * The running balance is the variant's real `PartnerInventory.stockAvailable` history, not
 * just a sum within the page: for every variant on the page we first sum every ledger delta
 * strictly older than the page's oldest row (ignoring the `reason` filter, since a filtered
 * view must still show the true stock level, not a stock level as if the other reasons never
 * happened), then accumulate forward through the page in chronological order.
 */

const PAGE_SIZE = 50;
const REASON_VALUES = new Set<string>(Object.values(InventoryLedgerReason));

async function requireInventoryPartner() {
  const user = await requirePartner();
  const partner = await prisma.partner.findUnique({
    where: { id: user.partnerId },
    select: { id: true, partnerType: true },
  });
  if (!partner || !["AGENT", "DISTRIBUTOR"].includes(partner.partnerType)) {
    const err = new Error("FORBIDDEN");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return user;
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireInventoryPartner();
    const { searchParams } = new URL(req.url);

    const fromRaw = searchParams.get("from");
    const toRaw = searchParams.get("to");
    const reasonRaw = searchParams.get("reason");
    const variantId = (searchParams.get("variantId") ?? "").trim() || null;
    const page = Math.max(0, Number(searchParams.get("page") ?? 0) || 0);

    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;
    if (from && Number.isNaN(from.getTime())) return apiBadRequest("from غير صالح");
    if (to && Number.isNaN(to.getTime())) return apiBadRequest("to غير صالح");
    if (reasonRaw && !REASON_VALUES.has(reasonRaw)) return apiBadRequest("reason غير صالح");

    const where: Prisma.InventoryLedgerWhereInput = {
      partnerId: user.partnerId,
      ...(variantId ? { variantId } : {}),
      ...(reasonRaw ? { reason: reasonRaw as InventoryLedgerReason } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.inventoryLedger.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: PAGE_SIZE,
        skip: page * PAGE_SIZE,
        include: {
          variant: {
            select: { id: true, sku: true, name: true, colorName: true, product: { select: { name: true } } },
          },
        },
      }),
      prisma.inventoryLedger.count({ where }),
    ]);

    // Running balance per variant present on this page.
    const variantIds = Array.from(new Set(rows.map((r) => r.variantId)));
    const oldestOnPage = rows.length > 0 ? rows[rows.length - 1].createdAt : null;

    const priorSums = new Map<string, number>();
    if (variantIds.length > 0 && oldestOnPage) {
      const priorRows = await prisma.inventoryLedger.groupBy({
        by: ["variantId"],
        where: { partnerId: user.partnerId, variantId: { in: variantIds }, createdAt: { lt: oldestOnPage } },
        _sum: { quantityAvailableDelta: true },
      });
      for (const row of priorRows) priorSums.set(row.variantId, row._sum.quantityAvailableDelta ?? 0);
    }

    // Walk the page chronologically (oldest -> newest) to accumulate the running balance,
    // then map it back onto the newest-first response order.
    const chronological = [...rows].reverse();
    const runningByRowId = new Map<string, number>();
    const running = new Map<string, number>(priorSums);
    for (const row of chronological) {
      const next = (running.get(row.variantId) ?? 0) + row.quantityAvailableDelta;
      running.set(row.variantId, next);
      runningByRowId.set(row.id, next);
    }

    const data = rows.map((row) => ({
      id: row.id,
      variantId: row.variantId,
      sku: row.variant.sku,
      product: row.variant.product.name,
      variant: `${row.variant.name}${row.variant.colorName ? ` · ${row.variant.colorName}` : ""}`,
      reason: row.reason,
      quantityAvailableDelta: row.quantityAvailableDelta,
      quantityReservedDelta: row.quantityReservedDelta,
      notes: row.notes,
      createdAt: row.createdAt,
      runningBalance: runningByRowId.get(row.id) ?? null,
    }));

    return apiSuccess({ rows: data, total, page, pageSize: PAGE_SIZE });
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
