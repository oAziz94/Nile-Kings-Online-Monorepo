import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiForbidden, apiNotFound, apiUnauthorized } from "@/lib/api/response";
import { handleInventoryReport } from "@/lib/reports/handlers/inventory";

/**
 * `GET /api/admin/partners/[id]/reports/inventory` (backlog 9.4b الأداء tab) — B3, see the
 * sales route's sibling for the shared shape.
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

  return handleInventoryReport(req, { partnerId: id });
}
