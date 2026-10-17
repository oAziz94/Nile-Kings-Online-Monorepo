import type { Prisma } from "@prisma/client";
import { addDaysIsoUtc, cairoStartOfDayUtc } from "@/lib/analytics/cairo-day";
import { normalizeEgyptMobilePhone } from "@/lib/phone";
import { PAYMENT_METHODS, type SalePaymentMethod } from "@/lib/sales/validation";

/**
 * Sales log query (backlog 11.4). Pure filter parsing + where-builder, and a lister that takes the
 * Prisma client as an argument so it runs against a fake in `list-sales.test.ts`.
 * Shape family: `{ items, nextCursor, totals }` (notifications / history).
 * Totals describe the filtered range (days, payment, q) regardless of the status list:
 * `count` = receipts that stand (COMPLETED), `revenuePiastres` = their sum, `voidedCount` = VOIDED.
 */

export const SALES_PAGE_SIZE = 30;
export const SALES_MAX_PAGE_SIZE = 100;

export type SaleStatusFilter = "COMPLETED" | "VOIDED";

export type SalesFilters = {
  from: string | null; // YYYY-MM-DD, Africa/Cairo day (inclusive)
  to: string | null; // YYYY-MM-DD, Africa/Cairo day (inclusive)
  paymentMethod: SalePaymentMethod | null;
  statuses: SaleStatusFilter[];
  q: string | null;
  cursor: string | null;
  limit: number;
};

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDay(iso: string): boolean {
  if (!DAY_RE.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

export function parseSalesQuery(
  params: URLSearchParams
): { ok: true; value: SalesFilters } | { ok: false; message: string } {
  const from = params.get("from")?.trim() || null;
  const to = params.get("to")?.trim() || null;
  if ((from && !isRealDay(from)) || (to && !isRealDay(to))) return { ok: false, message: "تاريخ غير صالح" };
  if (from && to && from > to) return { ok: false, message: "تاريخ البداية بعد تاريخ النهاية" };

  const pm = params.get("paymentMethod")?.trim() || null;
  if (pm && !PAYMENT_METHODS.includes(pm as SalePaymentMethod)) return { ok: false, message: "طريقة الدفع غير صالحة" };

  const statusRaw = params.get("status")?.trim();
  let statuses: SaleStatusFilter[] = ["COMPLETED", "VOIDED"];
  if (statusRaw) {
    const parts = statusRaw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0 || parts.some((p) => p !== "COMPLETED" && p !== "VOIDED")) {
      return { ok: false, message: "حالة غير صالحة" };
    }
    statuses = Array.from(new Set(parts)) as SaleStatusFilter[];
  }

  const q = params.get("q")?.trim().slice(0, 100) || null;
  const limitRaw = params.get("limit");
  const limit = limitRaw ? Math.min(SALES_MAX_PAGE_SIZE, Math.max(1, Number(limitRaw) || SALES_PAGE_SIZE)) : SALES_PAGE_SIZE;

  return {
    ok: true,
    value: {
      from,
      to,
      paymentMethod: (pm as SalePaymentMethod) || null,
      statuses,
      q,
      cursor: params.get("cursor") || null,
      limit,
    },
  };
}

export function encodeCursor(soldAt: Date, id: string): string {
  return Buffer.from(`${soldAt.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(cursor: string): { soldAt: Date; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    const soldAt = new Date(iso);
    if (!id || Number.isNaN(soldAt.getTime())) return null;
    return { soldAt, id };
  } catch {
    return null;
  }
}

/** Range + payment + search, without status or cursor (the totals share it). */
export function buildBaseWhere(
  partnerId: string,
  f: Pick<SalesFilters, "from" | "to" | "paymentMethod" | "q">
): Prisma.StoreSaleWhereInput {
  const and: Prisma.StoreSaleWhereInput[] = [];
  if (f.from || f.to) {
    and.push({
      soldAt: {
        ...(f.from ? { gte: cairoStartOfDayUtc(f.from) } : {}),
        ...(f.to ? { lt: cairoStartOfDayUtc(addDaysIsoUtc(f.to, 1)) } : {}),
      },
    });
  }
  if (f.paymentMethod) and.push({ paymentMethod: f.paymentMethod });
  if (f.q) {
    const or: Prisma.StoreSaleWhereInput[] = [{ customerName: { contains: f.q, mode: "insensitive" } }];
    if (/^\d{1,9}$/.test(f.q)) or.push({ receiptNo: Number(f.q) });
    const digits = f.q.replace(/\D/g, "");
    if (digits.length >= 4) {
      const normalized = normalizeEgyptMobilePhone(f.q);
      or.push({ customerPhone: normalized ?? { contains: digits.replace(/^0+/, "") } });
    }
    and.push({ OR: or });
  }
  return { partnerId, ...(and.length ? { AND: and } : {}) };
}

export type SaleListRow = {
  id: string;
  receiptNo: number;
  soldAt: string;
  status: SaleStatusFilter;
  paymentMethod: SalePaymentMethod;
  subtotalPiastres: number;
  itemCount: number;
  customerName: string | null;
  customerPhone: string | null;
  voidReason: string | null;
};

export type SalesListResponse = {
  items: SaleListRow[];
  nextCursor: string | null;
  totals: { count: number; revenuePiastres: number; voidedCount: number };
};

type DbRow = {
  id: string;
  receiptNo: number;
  soldAt: Date;
  status: SaleStatusFilter;
  paymentMethod: SalePaymentMethod;
  subtotalPiastres: number;
  customerName: string | null;
  customerPhone: string | null;
  voidReason: string | null;
  items: { quantity: number }[];
};

export type SalesListDb = {
  storeSale: {
    findMany(args: {
      where: Prisma.StoreSaleWhereInput;
      orderBy: { soldAt?: "desc"; id?: "desc" }[];
      take: number;
      select: Prisma.StoreSaleSelect;
    }): Promise<DbRow[]>;
    groupBy(args: {
      by: "status"[];
      where: Prisma.StoreSaleWhereInput;
      _count: { _all: true };
      _sum: { subtotalPiastres: true };
    }): Promise<{ status: SaleStatusFilter; _count: { _all: number }; _sum: { subtotalPiastres: number | null } }[]>;
  };
};

export async function listStoreSales(
  db: SalesListDb,
  partnerId: string,
  f: SalesFilters
): Promise<SalesListResponse | { badCursor: true }> {
  const base = buildBaseWhere(partnerId, f);
  const listAnd: Prisma.StoreSaleWhereInput[] = [{ status: { in: f.statuses } }];
  if (f.cursor) {
    const c = decodeCursor(f.cursor);
    if (!c) return { badCursor: true };
    listAnd.push({ OR: [{ soldAt: { lt: c.soldAt } }, { soldAt: c.soldAt, id: { lt: c.id } }] });
  }

  const [rows, groups] = await Promise.all([
    db.storeSale.findMany({
      where: { AND: [base, ...listAnd] },
      orderBy: [{ soldAt: "desc" }, { id: "desc" }],
      take: f.limit + 1,
      select: {
        id: true,
        receiptNo: true,
        soldAt: true,
        status: true,
        paymentMethod: true,
        subtotalPiastres: true,
        customerName: true,
        customerPhone: true,
        voidReason: true,
        items: { select: { quantity: true } },
      },
    }),
    db.storeSale.groupBy({ by: ["status"], where: base, _count: { _all: true }, _sum: { subtotalPiastres: true } }),
  ]);

  const page = rows.slice(0, f.limit);
  const last = page[page.length - 1];
  const completed = groups.find((g) => g.status === "COMPLETED");
  const voided = groups.find((g) => g.status === "VOIDED");

  return {
    items: page.map((r) => ({
      id: r.id,
      receiptNo: r.receiptNo,
      soldAt: r.soldAt.toISOString(),
      status: r.status,
      paymentMethod: r.paymentMethod,
      subtotalPiastres: r.subtotalPiastres,
      itemCount: r.items.reduce((s, i) => s + i.quantity, 0),
      customerName: r.customerName,
      customerPhone: r.customerPhone,
      voidReason: r.voidReason,
    })),
    nextCursor: rows.length > f.limit && last ? encodeCursor(last.soldAt, last.id) : null,
    totals: {
      count: completed?._count._all ?? 0,
      revenuePiastres: completed?._sum.subtotalPiastres ?? 0,
      voidedCount: voided?._count._all ?? 0,
    },
  };
}
