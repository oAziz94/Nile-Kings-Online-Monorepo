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

  const { searchParams } = new URL(req.url);
  const partnerType = searchParams.get("partnerType") as "AGENT" | "DISTRIBUTOR" | null;
  if (!partnerType || !["AGENT", "DISTRIBUTOR"].includes(partnerType)) {
    return apiBadRequest("partnerType مطلوب (AGENT أو DISTRIBUTOR)");
  }

  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const where = { partnerType };
  const include =
    partnerType === "DISTRIBUTOR"
      ? { linkedAgent: { select: { id: true, name: true, phone: true } } }
      : { _count: { select: { distributors: true } } };

  const [partners, total] = await Promise.all([
    prisma.partner.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include,
    }),
    prisma.partner.count({ where }),
  ]);

  return apiSuccess({ partners, total, limit, offset });
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

  let body: {
    partnerType: string;
    name: string;
    governorate: string;
    phone: string;
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

  if (!["AGENT", "DISTRIBUTOR"].includes(body.partnerType ?? "")) {
    return apiBadRequest("partnerType يجب أن يكون AGENT أو DISTRIBUTOR");
  }
  if (!body.name?.trim()) return apiBadRequest("الاسم مطلوب");
  if (!body.governorate?.trim()) return apiBadRequest("المحافظة مطلوبة");
  if (!body.phone?.trim()) return apiBadRequest("رقم التليفون مطلوب");

  let linkedAgentId: string | null = null;
  if (body.partnerType === "DISTRIBUTOR" && body.linkedAgentId?.trim()) {
    const agent = await prisma.partner.findFirst({
      where: { id: body.linkedAgentId.trim(), partnerType: "AGENT" },
    });
    if (!agent) return apiBadRequest("الوكيل المحدد غير موجود");
    linkedAgentId = agent.id;
  }

  const partner = await prisma.partner.create({
    data: {
      partnerType: body.partnerType as "AGENT" | "DISTRIBUTOR",
      name: body.name.trim(),
      governorate: body.governorate.trim(),
      phone: body.phone.trim(),
      facebookUrl: body.facebookUrl?.trim() || null,
      instagramUrl: body.instagramUrl?.trim() || null,
      tiktokUrl: body.tiktokUrl?.trim() || null,
      youtubeUrl: body.youtubeUrl?.trim() || null,
      websiteUrl: body.websiteUrl?.trim() || null,
      otherUrl: body.otherUrl?.trim() || null,
      linkedAgentId,
      isActive: body.isActive !== false,
      notes: body.notes?.trim() || null,
    },
  });
  return apiSuccess(partner);
}
