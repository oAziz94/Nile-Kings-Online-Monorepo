import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiNotFound, apiUnauthorized } from "@/lib/api/response";
import { handleSalesReport } from "@/lib/reports/handlers/sales";

/**
 * `GET /api/admin/partners/[id]/reports/sales` (backlog 9.4b الأداء tab) — the admin reads
 * this partner's own sales report through the exact same handler the partner route calls
 * (B3), differing only in how the partner id is resolved.
 */
type Params = Promise<{ id: string }>;

export async function GET(req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id }, select: { id: true } });
  if (!partner) return apiNotFound("الشريك غير موجود");

  return handleSalesReport(req, id);
}
