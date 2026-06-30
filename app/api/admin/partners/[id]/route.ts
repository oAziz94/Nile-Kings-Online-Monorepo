import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";

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
  try {
    await requireAdmin();
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
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
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
    },
  });
  return apiSuccess(updated);
}
