import { NextRequest } from "next/server";
import { z } from "zod";
import { requirePartner } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiBadRequest, apiForbidden, apiSuccess, apiUnauthorized } from "@/lib/api/response";

/** GET/PATCH /api/partner/settings (backlog 4.17) — `lowStockThreshold`, integer 0–999. */

const settingsSchema = z.object({
  lowStockThreshold: z.number().int().min(0).max(999),
});

export async function GET() {
  try {
    const user = await requirePartner();
    const partner = await prisma.partner.findUnique({
      where: { id: user.partnerId },
      select: { lowStockThreshold: true },
    });
    if (!partner) return apiForbidden("غير مصرح");
    return apiSuccess({ lowStockThreshold: partner.lowStockThreshold });
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

    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) {
      return apiBadRequest("حد التنبيه يجب أن يكون رقماً صحيحاً بين 0 و999");
    }

    const updated = await prisma.partner.update({
      where: { id: user.partnerId },
      data: { lowStockThreshold: parsed.data.lowStockThreshold },
      select: { lowStockThreshold: true },
    });
    return apiSuccess({ lowStockThreshold: updated.lowStockThreshold }, "تم حفظ الإعدادات");
  } catch (error: unknown) {
    const err = error as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw error;
  }
}
