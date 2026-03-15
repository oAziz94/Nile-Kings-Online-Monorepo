import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";

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
  const { id: ruleId } = await params;
  const rule = await prisma.reroutingRule.findUnique({
    where: { id: ruleId },
    include: {
      partners: {
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        include: { partner: { select: { id: true, name: true, phone: true, partnerType: true, governorate: true } } },
      },
    },
  });
  if (!rule) return apiNotFound("القاعدة غير موجودة");
  return apiSuccess({ partners: rule.partners });
}

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id: ruleId } = await params;
  const rule = await prisma.reroutingRule.findUnique({ where: { id: ruleId } });
  if (!rule) return apiNotFound("القاعدة غير موجودة");

  let body: { partnerId?: string; priority?: number | null };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const partnerId = typeof body.partnerId === "string" ? body.partnerId.trim() : "";
  if (!partnerId) return apiBadRequest("partnerId مطلوب");

  const partner = await prisma.partner.findUnique({
    where: { id: partnerId },
    select: { id: true },
  });
  if (!partner) return apiBadRequest("الشريك غير موجود");

  const existing = await prisma.reroutingRulePartner.findUnique({
    where: { ruleId_partnerId: { ruleId, partnerId } },
  });
  if (existing) return apiBadRequest("الشريك مضاف مسبقاً لهذه القاعدة");

  const link = await prisma.reroutingRulePartner.create({
    data: {
      ruleId,
      partnerId,
      priority: typeof body.priority === "number" ? body.priority : null,
      isActive: true,
    },
    include: { partner: { select: { id: true, name: true, phone: true, partnerType: true, governorate: true } } },
  });
  return apiSuccess(link);
}
