import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { logAdminAction, requestIp } from "@/lib/audit/admin-audit";
import { revalidateReroutingRules } from "@/lib/cache/catalog-tags";

type Params = Promise<{ id: string; linkId: string }>;

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
  const { id: ruleId, linkId } = await params;
  const link = await prisma.reroutingRulePartner.findFirst({
    where: { id: linkId, ruleId },
    include: { partner: { select: { id: true, name: true, phone: true, partnerType: true } }, rule: { select: { governorate: true } } },
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

  if (data.isActive !== undefined && data.isActive !== link.isActive) {
    // Only `after` (no `before`) on purpose: pause/resume is an event, not a field diff, and
    // `logAdminAction` would otherwise strip `partnerId`/`partnerName` from the stored row
    // (they don't change) leaving only `isActive` — which `describeAdminAudit` needs the
    // partner's name for ("أوقف <partner> مؤقتًا في <governorate>").
    await logAdminAction(prisma, {
      actor,
      action: data.isActive ? "resume_partner" : "pause_partner",
      entityType: "routing",
      entityId: link.rule.governorate,
      entityLabel: link.rule.governorate,
      after: { partnerId: link.partnerId, partnerName: link.partner.name, isActive: updated.isActive },
      ip: requestIp(req),
    });
  }
  revalidateReroutingRules();
  return apiSuccess(updated);
}

export async function DELETE(req: NextRequest, { params }: { params: Params }) {
  let actor;
  try {
    actor = await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id: ruleId, linkId } = await params;
  const link = await prisma.reroutingRulePartner.findFirst({
    where: { id: linkId, ruleId },
    include: { partner: { select: { name: true } }, rule: { select: { governorate: true } } },
  });
  if (!link) return apiNotFound("الرابط غير موجود");
  await prisma.reroutingRulePartner.delete({ where: { id: linkId } });
  await logAdminAction(prisma, {
    actor,
    action: "remove_partner",
    entityType: "routing",
    entityId: link.rule.governorate,
    entityLabel: link.rule.governorate,
    before: { partnerId: link.partnerId, partnerName: link.partner.name },
    ip: requestIp(req),
  });
  revalidateReroutingRules();
  return apiSuccess({ deleted: true });
}
