import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";

type Params = Promise<{ id: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }
  const { id } = await params;

  const partnerRequest = await prisma.partnerRequest.findUnique({ where: { id } });
  if (!partnerRequest) return apiNotFound("طلب الشريك غير موجود");

  const linkedAgentId = (req.nextUrl.searchParams.get("linkedAgentId") ?? "").trim() || null;
  if (partnerRequest.requestType === "DISTRIBUTOR" && linkedAgentId) {
    const agent = await prisma.partner.findFirst({
      where: { id: linkedAgentId, partnerType: "AGENT", isActive: true },
    });
    if (!agent) return apiBadRequest("الوكيل المحدد غير موجود أو غير نشط");
  }
  if (partnerRequest.requestType === "AGENT" && linkedAgentId) {
    return apiBadRequest("وكيل لا يمكن ربطه بوكيل آخر");
  }

  const partnerType = partnerRequest.requestType === "AGENT" ? "AGENT" : "DISTRIBUTOR";

  const [partner] = await prisma.$transaction([
    prisma.partner.create({
      data: {
        partnerType,
        name: partnerRequest.name,
        governorate: partnerRequest.governorate,
        phone: partnerRequest.phone,
        facebookUrl: partnerRequest.facebookUrl,
        instagramUrl: partnerRequest.instagramUrl,
        tiktokUrl: partnerRequest.tiktokUrl,
        youtubeUrl: partnerRequest.youtubeUrl,
        websiteUrl: partnerRequest.websiteUrl,
        otherUrl: partnerRequest.otherUrl,
        linkedAgentId: partnerRequest.requestType === "DISTRIBUTOR" ? linkedAgentId : null,
        isActive: true,
        notes: partnerRequest.notes,
      },
    }),
    prisma.partnerRequest.update({
      where: { id },
      data: { status: "APPROVED" },
    }),
  ]);

  return apiSuccess({ partner, message: "تم التحويل إلى شريك بنجاح" });
}
