import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";
import { revalidateReroutingRules } from "@/lib/cache/catalog-tags";

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
  const rule = await prisma.reroutingRule.findUnique({
    where: { id },
    include: {
      partners: {
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        include: { partner: { select: { id: true, name: true, phone: true, partnerType: true, governorate: true } } },
      },
      lastAssignedPartner: { select: { id: true, name: true, phone: true, partnerType: true } },
    },
  });
  if (!rule) return apiNotFound("القاعدة غير موجودة");
  return apiSuccess(rule);
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
  const existing = await prisma.reroutingRule.findUnique({ where: { id } });
  if (!existing) return apiNotFound("القاعدة غير موجودة");

  let body: { isActive?: boolean };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const data: { isActive?: boolean } = {};
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;

  const rule = await prisma.reroutingRule.update({
    where: { id },
    data,
    include: {
      partners: {
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        include: { partner: { select: { id: true, name: true, phone: true, partnerType: true, governorate: true } } },
      },
      lastAssignedPartner: { select: { id: true, name: true, phone: true, partnerType: true } },
    },
  });
  if (data.isActive !== undefined) {
    await logAdminAction(prisma, {
      actor,
      action: "set_mode",
      entityType: "routing",
      entityId: rule.governorate,
      entityLabel: rule.governorate,
      before: { isActive: existing.isActive },
      after: { isActive: rule.isActive },
      ip: requestIp(req),
    });
  }
  if (data.isActive !== undefined) revalidateReroutingRules();
  return apiSuccess(rule);
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;
  const existing = await prisma.reroutingRule.findUnique({ where: { id } });
  if (!existing) return apiNotFound("القاعدة غير موجودة");
  await prisma.reroutingRule.delete({ where: { id } });
  revalidateReroutingRules();
  return apiSuccess({ deleted: true });
}
