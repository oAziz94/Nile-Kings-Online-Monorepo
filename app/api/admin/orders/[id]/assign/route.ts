import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiConflict, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { requestIp } from "@/lib/audit/admin-audit";
import { InsufficientPartnerStockError } from "@/lib/inventory/partner-inventory";
import { assignOrderToPartner, AssignPartnerError } from "@/lib/orders/assign-partner";

type Params = Promise<{ id: string }>;

/**
 * POST /api/admin/orders/[id]/assign — assign an unassigned order to a partner, or move an
 * already-assigned order to a new one (backlog 9.3 d). Body: `{ partnerId, notes? }`.
 */
export async function POST(req: NextRequest, { params }: { params: Params }) {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id: orderId } = await params;

  let body: { partnerId?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const partnerId = typeof body.partnerId === "string" ? body.partnerId.trim() : "";
  if (!partnerId) return apiBadRequest("partnerId مطلوب");
  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : undefined;

  try {
    const result = await prisma.$transaction(
      (tx) =>
        assignOrderToPartner(tx, {
          orderId,
          partnerId,
          actor: admin,
          notes,
          ip: requestIp(req),
        }),
      { maxWait: 15_000, timeout: 60_000 }
    );
    return apiSuccess(result);
  } catch (error) {
    if (error instanceof AssignPartnerError) {
      if (error.status === 404) return apiNotFound(error.message);
      if (error.status === 409) return apiConflict(error.message);
      return apiBadRequest(error.message);
    }
    if (error instanceof InsufficientPartnerStockError) {
      const variant = await prisma.variant.findUnique({ where: { id: error.variantId }, select: { sku: true } });
      const sku = variant?.sku ?? error.variantId;
      return apiConflict(
        `الشريك لا يملك مخزونًا كافيًا لهذا الطلب (${sku}: مطلوب ${error.requested}، متاح ${error.available})`
      );
    }
    throw error;
  }
}
