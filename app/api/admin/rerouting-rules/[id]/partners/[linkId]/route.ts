import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";

type Params = Promise<{ id: string; linkId: string }>;

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id: ruleId, linkId } = await params;
  const link = await prisma.reroutingRulePartner.findFirst({
    where: { id: linkId, ruleId },
    include: { partner: { select: { id: true, name: true, phone: true, partnerType: true } } },
  });
  if (!link) return apiNotFound("الرابط غير موجود");

  let body: { isActive?: boolean; priority?: number | null };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const data: { isActive?: boolean; priority?: number | null } = {};
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  if (body.priority !== undefined) data.priority = body.priority === null ? null : Number(body.priority);

  const updated = await prisma.reroutingRulePartner.update({
    where: { id: linkId },
    data,
    include: { partner: { select: { id: true, name: true, phone: true, partnerType: true, governorate: true } } },
  });
  return apiSuccess(updated);
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
  const { id: ruleId, linkId } = await params;
  const link = await prisma.reroutingRulePartner.findFirst({
    where: { id: linkId, ruleId },
  });
  if (!link) return apiNotFound("الرابط غير موجود");
  await prisma.reroutingRulePartner.delete({ where: { id: linkId } });
  return apiSuccess({ deleted: true });
}
