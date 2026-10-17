import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiNotFound, apiSuccess, apiUnauthorized } from "@/lib/api/response";
import { parseSalesQuery } from "@/lib/sales/list-sales";
import { listOutletSalesForAdmin, type AdminSalesDb } from "@/lib/sales/admin-sales";

/**
 * `GET /api/admin/partners/[id]/sales` (backlog 11.6): one outlet's sales log for the admin. Same
 * filters, paging and totals as `GET /api/partner/sales`; the id must be an outlet.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const parsed = parseSalesQuery(new URL(req.url).searchParams);
  if (!parsed.ok) return apiBadRequest(parsed.message);
  const result = await listOutletSalesForAdmin(prisma as unknown as AdminSalesDb, id, parsed.value);
  if (!result.ok) {
    if (result.reason === "not_found") return apiNotFound("الشريك غير موجود");
    if (result.reason === "not_outlet") return apiBadRequest("هذا الشريك ليس منفذاً");
    return apiBadRequest("المؤشر غير صالح");
  }
  return apiSuccess(result.value);
}
