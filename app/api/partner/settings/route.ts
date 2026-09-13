import { NextRequest } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";

/**
 * GET/PATCH /api/partner/settings (backlog 4.17, extended 5.1) — the partner's working
 * profile: `lowStockThreshold` (4.17), plus `workingDays`/`dailyOrderCapacity`/
 * `confirmSlaHours`/`shipSlaHours`/`handoverMethod`/`serviceAreas`/`alertPrefs` (5.1,
 * `05-partner-portal-v2.md` §4.1). `costRateBps` is **read-only** here — rule (18):
 * "`Partner.costRateBps` is written only by admin routes — a partner API that accepts it
 * is a defect." A PATCH body carrying `costRateBps` is rejected with 400 rather than
 * silently ignored, so a bug that tries to write it is caught, not swallowed.
 */

const WORKING_DAY_CODES = ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"] as const;
const HANDOVER_METHODS = ["COURIER", "PICKUP", "OWN_DELIVERY"] as const;

const patchSchema = z
  .object({
    lowStockThreshold: z.number().int().min(0).max(999).optional(),
    workingDays: z.array(z.enum(WORKING_DAY_CODES)).optional(),
    dailyOrderCapacity: z.number().int().min(0).max(100_000).nullable().optional(),
    confirmSlaHours: z.number().int().min(1).max(24 * 30).optional(),
    shipSlaHours: z.number().int().min(1).max(24 * 30).optional(),
    handoverMethod: z.enum(HANDOVER_METHODS).optional(),
    serviceAreas: z.record(z.string(), z.array(z.string())).nullable().optional(),
    alertPrefs: z.record(z.string(), z.boolean()).nullable().optional(),
  })
  .strict();

function serialize(partner: {
  lowStockThreshold: number;
  workingDays: string[];
  dailyOrderCapacity: number | null;
  confirmSlaHours: number;
  shipSlaHours: number;
  handoverMethod: string;
  serviceAreas: unknown;
  alertPrefs: unknown;
  costRateBps: number;
}) {
  return {
    lowStockThreshold: partner.lowStockThreshold,
    workingDays: partner.workingDays,
    dailyOrderCapacity: partner.dailyOrderCapacity,
    confirmSlaHours: partner.confirmSlaHours,
    shipSlaHours: partner.shipSlaHours,
    handoverMethod: partner.handoverMethod,
    serviceAreas: partner.serviceAreas ?? null,
    alertPrefs: partner.alertPrefs ?? null,
    // Read-only account-with-the-factory block (backlog 5.1).
    costRateBps: partner.costRateBps,
    marginBps: 10_000 - partner.costRateBps,
    paymentMethodLabel: "دفعة مقدمة + أقساط",
  };
}

const SETTINGS_SELECT = {
  lowStockThreshold: true,
  workingDays: true,
  dailyOrderCapacity: true,
  confirmSlaHours: true,
  shipSlaHours: true,
  handoverMethod: true,
  serviceAreas: true,
  alertPrefs: true,
  costRateBps: true,
} as const;

export async function GET() {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({
      where: { id: user.partnerId },
      select: SETTINGS_SELECT,
    });
    if (!partner) return apiForbidden("غير مصرح");
    return apiSuccess(serialize(partner));
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requirePartner();
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiBadRequest("جسم الطلب غير صالح");
    }

    if (body && typeof body === "object" && "costRateBps" in (body as Record<string, unknown>)) {
      return apiBadRequest("نسبة الشراء من سعر البيع تُحددها الإدارة ولا يمكن تعديلها من هنا");
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiBadRequest(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
    }
    if (Object.keys(parsed.data).length === 0) {
      return apiBadRequest("لا توجد بيانات للحفظ");
    }

    const { serviceAreas, alertPrefs, ...rest } = parsed.data;
    const data: Prisma.PartnerUpdateInput = { ...rest };
    if ("serviceAreas" in parsed.data) {
      data.serviceAreas = serviceAreas === null ? Prisma.JsonNull : (serviceAreas as Prisma.InputJsonValue);
    }
    if ("alertPrefs" in parsed.data) {
      data.alertPrefs = alertPrefs === null ? Prisma.JsonNull : (alertPrefs as Prisma.InputJsonValue);
    }

    const updated = await prisma.partner.update({
      where: { id: user.partnerId },
      data,
      select: SETTINGS_SELECT,
    });
    return apiSuccess(serialize(updated), "تم حفظ الإعدادات");
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
