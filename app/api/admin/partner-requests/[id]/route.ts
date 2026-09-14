import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";

type Params = Promise<{ id: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const request = await prisma.partnerRequest.findUnique({ where: { id } });
  if (!request) return apiNotFound("طلب الشريك غير موجود");
  return apiSuccess(request);
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const existing = await prisma.partnerRequest.findUnique({ where: { id } });
  if (!existing) return apiNotFound("طلب الشريك غير موجود");

  let body: { status?: string; notes?: string | null };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const status = body.status?.trim();
  if (body.status !== undefined && !["PENDING", "CONTACTED", "APPROVED", "REJECTED"].includes(status ?? "")) {
    return apiBadRequest("الحالة غير صالحة");
  }

  const updated = await prisma.partnerRequest.update({
    where: { id },
    data: {
      ...(body.status !== undefined && { status: status as "PENDING" | "CONTACTED" | "APPROVED" | "REJECTED" }),
      ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
    },
  });
  // Backlog 9.7 (c) — a partner request's status is a workflow status, in scope of B1
  // ("every admin write that changes ... status ... appends an AdminAuditLog row").
  await logAdminAction(prisma, {
    actor,
    action: "update",
    entityType: "partner_request",
    entityId: id,
    entityLabel: existing.name,
    before: { status: existing.status },
    after: { status: updated.status },
    ip: requestIp(req),
  });
  return apiSuccess(updated);
}
