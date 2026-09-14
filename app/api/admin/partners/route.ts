import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";
import { logAdminAction, requestIp, sanitizeForAudit } from "@/lib/audit/admin-audit";
import { computePartnersHealth } from "@/lib/admin/partners-list";

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
  const health = searchParams.get("health") === "1";
  const partnerTypeParam = searchParams.get("partnerType") as "AGENT" | "DISTRIBUTOR" | null;

  // Backlog 9.4a (d) — the الشركاء hub list needs every agent AND distributor in one call
  // with health columns; every other caller (agents/distributors dropdowns, orders page
  // filters, etc.) keeps requiring `partnerType` unchanged.
  if (!health && (!partnerTypeParam || !["AGENT", "DISTRIBUTOR"].includes(partnerTypeParam))) {
    return apiBadRequest("partnerType مطلوب (AGENT أو DISTRIBUTOR)");
  }

  const qRaw = (searchParams.get("q") ?? "").trim().slice(0, 100);
  const q = qRaw.length > 0 ? qRaw : undefined;
  const governorate = (searchParams.get("governorate") ?? "").trim() || undefined;
  const needsAttentionOnly = searchParams.get("needsAttention") === "1";
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50));
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  const where: Prisma.PartnerWhereInput = {
    ...(partnerTypeParam ? { partnerType: partnerTypeParam } : {}),
    ...(governorate ? { governorate } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: Prisma.QueryMode.insensitive } },
            { phone: { contains: q, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
  };

  if (!health) {
    const include =
      partnerTypeParam === "DISTRIBUTOR"
        ? { linkedAgent: { select: { id: true, name: true, phone: true } } }
        : { _count: { select: { distributors: true } } };
    const [partners, total] = await Promise.all([
      prisma.partner.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset, include }),
      prisma.partner.count({ where }),
    ]);
    return apiSuccess({ partners, total, limit, offset });
  }

  // health=1 — the list page's own call: every matching partner (no take/skip yet, since
  // "يحتاج انتباه" filters *after* health is computed), with linkedAgent for the "تابع لـ…"
  // subtitle on distributor rows.
  const allMatching = await prisma.partner.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { linkedAgent: { select: { id: true, name: true } } },
  });

  const healthByPartnerId = await computePartnersHealth(allMatching.map((p) => p.id));
  let rows = allMatching.map((p) => ({ ...p, health: healthByPartnerId.get(p.id) ?? null }));
  if (needsAttentionOnly) rows = rows.filter((r) => r.health?.needsAttention);

  const total = rows.length;
  const page = rows.slice(offset, offset + limit);
  return apiSuccess({ partners: page, total, limit, offset });
}

export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireAdmin();
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
  const normalizedPhone = normalizeEgyptMobilePhone(body.phone);
  if (!normalizedPhone) return apiBadRequest(EGYPT_MOBILE_ERROR_MESSAGE);

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
      phone: normalizedPhone,
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
  await logAdminAction(prisma, {
    actor,
    action: "create",
    entityType: "partner",
    entityId: partner.id,
    entityLabel: partner.name,
    after: sanitizeForAudit(partner),
    ip: requestIp(req),
  });
  return apiSuccess(partner);
}
