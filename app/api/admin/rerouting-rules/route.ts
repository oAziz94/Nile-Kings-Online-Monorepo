import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  const rules = await prisma.reroutingRule.findMany({
    orderBy: { governorate: "asc" },
    include: {
      _count: { select: { partners: true } },
      lastAssignedPartner: { select: { id: true, name: true, phone: true, partnerType: true } },
    },
  });
  return apiSuccess({ rules });
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  let body: { governorate?: string; isActive?: boolean };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const governorate = typeof body.governorate === "string" ? body.governorate.trim() : "";
  if (!governorate) return apiBadRequest("المحافظة مطلوبة");

  const existing = await prisma.reroutingRule.findUnique({
    where: { governorate },
  });
  if (existing) return apiBadRequest("يوجد بالفعل قاعدة توجيه لهذه المحافظة");

  const rule = await prisma.reroutingRule.create({
    data: {
      governorate,
      isActive: body.isActive !== false,
    },
    include: {
      _count: { select: { partners: true } },
      lastAssignedPartner: { select: { id: true, name: true, phone: true, partnerType: true } },
    },
  });
  return apiSuccess(rule);
}
