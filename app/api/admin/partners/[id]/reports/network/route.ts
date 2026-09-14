import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiNotFound, apiUnauthorized } from "@/lib/api/response";
import { handleNetworkReport } from "@/lib/reports/handlers/network";

/**
 * `GET /api/admin/partners/[id]/reports/network` (backlog 9.4b الأداء tab) — network report
 * only for AGENT partners; a distributor id answers 400 (not the partner route's 403 — the
 * admin is asking about a specific partner's own screen set, and a distributor never has a
 * الشبكة report to view, so this is a bad request about that partner rather than a
 * forbidden-role response).
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
  const partner = await prisma.partner.findUnique({ where: { id }, select: { id: true, partnerType: true } });
  if (!partner) return apiNotFound("الشريك غير موجود");
  if (partner.partnerType !== "AGENT") return apiBadRequest("تقرير الشبكة متاح للوكلاء فقط");

  return handleNetworkReport(req, id);
}
