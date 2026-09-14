import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";
import { logAdminAction, requestIp, sanitizeForAudit } from "@/lib/audit/admin-audit";
import {
  confirmSlaHoursSchema,
  costRateBpsSchema,
  dailyOrderCapacitySchema,
  deadStockDaysSchema,
  lowStockThresholdSchema,
  shipSlaHoursSchema,
  targetCoverDaysSchema,
  workingDaysSchema,
} from "@/lib/partner/settings-schema";

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
  const partner = await prisma.partner.findUnique({
    where: { id },
    include: {
      linkedAgent: true,
      distributors: true,
    },
  });
  if (!partner) return apiNotFound("الشريك غير موجود");
  return apiSuccess(partner);
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
  const existing = await prisma.partner.findUnique({ where: { id } });
  if (!existing) return apiNotFound("الشريك غير موجود");

  let body: {
    name?: string;
    governorate?: string;
    phone?: string;
    facebookUrl?: string | null;
    instagramUrl?: string | null;
    tiktokUrl?: string | null;
    youtubeUrl?: string | null;
    websiteUrl?: string | null;
    otherUrl?: string | null;
    linkedAgentId?: string | null;
    isActive?: boolean;
    notes?: string | null;
    // Backlog 5.1 — the factory settlement rate, admin-write only (rule 18: a *partner*
    // API accepting this is a defect; this is the admin route, so it's the one place
    // allowed to write it).
    costRateBps?: number;
    // Backlog 9.4a (c) / `06-admin-v2.md` §8 control matrix — every knob partner v2
    // introduced, admin-controlled in one place. Same Zod bounds `PATCH
    // /api/partner/settings` uses, imported from `lib/partner/settings-schema.ts` (not
    // retyped). `confirmSlaHours`/`shipSlaHours` are admin-only from v2; the other five are
    // partner-owned defaults the admin can still see/override here.
    confirmSlaHours?: number;
    shipSlaHours?: number;
    lowStockThreshold?: number;
    deadStockDays?: number;
    targetCoverDays?: number;
    dailyOrderCapacity?: number | null;
    workingDays?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  if (body.costRateBps !== undefined && !costRateBpsSchema.safeParse(body.costRateBps).success) {
    return apiBadRequest("نسبة الشراء يجب أن تكون رقماً صحيحاً بين 0 و10000 (بالبيسيس بوينت)");
  }
  if (body.confirmSlaHours !== undefined && !confirmSlaHoursSchema.safeParse(body.confirmSlaHours).success) {
    return apiBadRequest("مهلة التأكيد غير صالحة");
  }
  if (body.shipSlaHours !== undefined && !shipSlaHoursSchema.safeParse(body.shipSlaHours).success) {
    return apiBadRequest("مهلة الشحن غير صالحة");
  }
  if (body.lowStockThreshold !== undefined && !lowStockThresholdSchema.safeParse(body.lowStockThreshold).success) {
    return apiBadRequest("الحد الأدنى للمخزون غير صالح");
  }
  if (body.deadStockDays !== undefined && !deadStockDaysSchema.safeParse(body.deadStockDays).success) {
    return apiBadRequest("عدد أيام الركود غير صالح");
  }
  if (body.targetCoverDays !== undefined && !targetCoverDaysSchema.safeParse(body.targetCoverDays).success) {
    return apiBadRequest("هدف أيام التغطية غير صالح");
  }
  if (
    body.dailyOrderCapacity !== undefined &&
    body.dailyOrderCapacity !== null &&
    !dailyOrderCapacitySchema.safeParse(body.dailyOrderCapacity).success
  ) {
    return apiBadRequest("الطاقة اليومية غير صالحة");
  }
  if (body.workingDays !== undefined && !workingDaysSchema.safeParse(body.workingDays).success) {
    return apiBadRequest("أيام العمل غير صالحة");
  }
  if (body.name !== undefined && !body.name?.trim()) return apiBadRequest("الاسم لا يمكن أن يكون فارغاً");
  if (body.governorate !== undefined && !body.governorate?.trim()) return apiBadRequest("المحافظة مطلوبة");
  if (body.phone !== undefined && !body.phone?.trim()) return apiBadRequest("رقم التليفون مطلوب");
  const normalizedPhone =
    body.phone !== undefined ? normalizeEgyptMobilePhone(body.phone) ?? undefined : undefined;
  if (body.phone !== undefined && !normalizedPhone) {
    return apiBadRequest(EGYPT_MOBILE_ERROR_MESSAGE);
  }

  let linkedAgentId: string | null | undefined = undefined;
  if (body.linkedAgentId !== undefined) {
    if (body.linkedAgentId === null || body.linkedAgentId === "") {
      linkedAgentId = null;
    } else if (existing.partnerType === "DISTRIBUTOR") {
      const agent = await prisma.partner.findFirst({
        where: { id: String(body.linkedAgentId).trim(), partnerType: "AGENT" },
      });
      if (!agent) return apiBadRequest("الوكيل المحدد غير موجود");
      linkedAgentId = agent.id;
    }
  }

  const updated = await prisma.partner.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.governorate !== undefined && { governorate: body.governorate.trim() }),
      ...(body.phone !== undefined && { phone: normalizedPhone }),
      ...(body.facebookUrl !== undefined && { facebookUrl: body.facebookUrl?.trim() || null }),
      ...(body.instagramUrl !== undefined && { instagramUrl: body.instagramUrl?.trim() || null }),
      ...(body.tiktokUrl !== undefined && { tiktokUrl: body.tiktokUrl?.trim() || null }),
      ...(body.youtubeUrl !== undefined && { youtubeUrl: body.youtubeUrl?.trim() || null }),
      ...(body.websiteUrl !== undefined && { websiteUrl: body.websiteUrl?.trim() || null }),
      ...(body.otherUrl !== undefined && { otherUrl: body.otherUrl?.trim() || null }),
      ...(linkedAgentId !== undefined && { linkedAgentId }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.notes !== undefined && { notes: body.notes?.trim() || null }),
      ...(body.costRateBps !== undefined && { costRateBps: body.costRateBps }),
      ...(body.confirmSlaHours !== undefined && { confirmSlaHours: body.confirmSlaHours }),
      ...(body.shipSlaHours !== undefined && { shipSlaHours: body.shipSlaHours }),
      ...(body.lowStockThreshold !== undefined && { lowStockThreshold: body.lowStockThreshold }),
      ...(body.deadStockDays !== undefined && { deadStockDays: body.deadStockDays }),
      ...(body.targetCoverDays !== undefined && { targetCoverDays: body.targetCoverDays }),
      ...(body.dailyOrderCapacity !== undefined && { dailyOrderCapacity: body.dailyOrderCapacity }),
      ...(body.workingDays !== undefined && { workingDays: body.workingDays }),
    },
  });
  await logAdminAction(prisma, {
    actor,
    action: "update",
    entityType: "partner",
    entityId: updated.id,
    entityLabel: updated.name,
    before: sanitizeForAudit(existing),
    after: sanitizeForAudit(updated),
    ip: requestIp(req),
  });
  return apiSuccess(updated);
}
