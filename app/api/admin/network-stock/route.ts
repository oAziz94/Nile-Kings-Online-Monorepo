import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { getNetworkStockRows, type NetworkStockRow } from "@/lib/analytics/network-stock";
import { formatCoverDays } from "@/lib/partner/stock-cover";

/**
 * `GET /api/admin/network-stock` (backlog 9.5b) — every active partner x SKU, built on
 * `getNetworkStockRows` (which reuses `computeInventoryRows` per partner, rule B3). Filters:
 * `q` (SKU/product search), `partnerId`, `categoryId`, `belowThresholdOnly` (default on per
 * the spec), `outOnly`. Sorted by cover ascending (no-velocity rows last) then sellable
 * ascending, offset-paginated at <=100 rows/page. `?format=csv` streams the same filtered/
 * sorted set (unpaginated) as a CSV of the visible rows.
 */
const MAX_PAGE_SIZE = 100;

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const partnerId = (searchParams.get("partnerId") ?? "").trim();
  const categoryId = (searchParams.get("categoryId") ?? "").trim();
  // Default on, per the spec ("تحت الحد فقط" default on) — explicitly pass belowThresholdOnly=0 to see everything.
  const belowThresholdOnly = searchParams.get("belowThresholdOnly") !== "0";
  const outOnly = searchParams.get("outOnly") === "1";
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(searchParams.get("limit") ?? 50) || 50));
  const offset = Math.max(0, Number(searchParams.get("offset") ?? 0) || 0);
  const format = (searchParams.get("format") ?? "").trim();

  const rows = await getNetworkStockRows();

  const filtered = rows.filter((r) => {
    if (partnerId && r.partnerId !== partnerId) return false;
    if (categoryId && r.categoryId !== categoryId) return false;
    if (outOnly && r.status !== "out") return false;
    if (belowThresholdOnly && r.status === "ok") return false;
    if (q) {
      const haystack = `${r.sku} ${r.productName} ${r.variantName} ${r.colorName ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const aCover = a.daysOfCover ?? Infinity;
    const bCover = b.daysOfCover ?? Infinity;
    if (aCover !== bCover) return aCover - bCover;
    return a.sellable - b.sellable;
  });

  if (format === "csv") {
    return new Response(buildCsv(filtered), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=network-stock.csv",
      },
    });
  }

  const total = filtered.length;
  const page = filtered.slice(offset, offset + limit);

  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  return apiSuccess({
    rows: page.map((r) => ({ ...r, categoryName: categoryNameById.get(r.categoryId) ?? null })),
    total,
    limit,
    offset,
  });
}

function buildCsv(rows: NetworkStockRow[]): string {
  const escape = (s: string | number) => {
    const str = String(s);
    return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const header = ["SKU", "المنتج", "المقاس", "اللون", "الشريك", "قابل للبيع", "تغطية (يوم)", "الحد", "الحالة"];
  const statusLabel: Record<string, string> = { out: "نافد", low: "تحت الحد", ok: "سليم" };
  const lines = [header.map(escape).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.sku,
        r.productName,
        r.variantName,
        r.colorName ?? "",
        r.partnerName,
        r.sellable,
        formatCoverDays(r.daysOfCover),
        r.threshold,
        statusLabel[r.status],
      ]
        .map(escape)
        .join(",")
    );
  }
  return `﻿${lines.join("\n")}`;
}
