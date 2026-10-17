import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden, apiNotFound } from "@/lib/api/response";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";
import { getPartnerNetworkDefaults } from "@/lib/settings";
import { outletLinkedAgentError } from "@/lib/admin/outlet-validation";
import { logAdminAction, requestIp, sanitizeForAudit } from "@/lib/audit/admin-audit";

type Params = Promise<{ id: string }>;

export async function POST(req: NextRequest, { params }: { params: Params }) {
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

  const partnerRequest = await prisma.partnerRequest.findUnique({ where: { id } });
  if (!partnerRequest) return apiNotFound("طلب الشريك غير موجود");

  const linkedAgentId = (req.nextUrl.searchParams.get("linkedAgentId") ?? "").trim() || null;
  // Backlog 11.6 (d) — an outlet request is never converted with a linked agent.
  const outletAgentError = outletLinkedAgentError(partnerRequest.requestType, linkedAgentId);
  if (outletAgentError) return apiBadRequest(outletAgentError);
  if (partnerRequest.requestType === "AGENT" && linkedAgentId) {
    return apiBadRequest("وكيل لا يمكن ربطه بوكيل آخر");
  }

  const partnerType = partnerRequest.requestType === "AGENT" ? "AGENT" : "DISTRIBUTOR";
  const normalizedPhone = normalizeEgyptMobilePhone(partnerRequest.phone);
  if (!normalizedPhone) return apiBadRequest(EGYPT_MOBILE_ERROR_MESSAGE);

  // Backlog 9.7 (a) — same stored network defaults `POST /api/admin/partners` seeds from.
  const networkDefaults = await getPartnerNetworkDefaults();

  const [partner] = await prisma.$transaction([
    prisma.partner.create({
      data: {
        partnerType,
        name: partnerRequest.name,
        governorate: partnerRequest.governorate,
        phone: normalizedPhone,
        facebookUrl: partnerRequest.facebookUrl,
        instagramUrl: partnerRequest.instagramUrl,
        tiktokUrl: partnerRequest.tiktokUrl,
        youtubeUrl: partnerRequest.youtubeUrl,
        websiteUrl: partnerRequest.websiteUrl,
        otherUrl: partnerRequest.otherUrl,
        linkedAgentId: null,
        isActive: true,
        notes: partnerRequest.notes,
        confirmSlaHours: networkDefaults.confirmSlaHours,
        shipSlaHours: networkDefaults.shipSlaHours,
        costRateBps: networkDefaults.costRateBps,
        lowStockThreshold: networkDefaults.lowStockThreshold,
        deadStockDays: networkDefaults.deadStockDays,
        targetCoverDays: networkDefaults.targetCoverDays,
      },
    }),
    prisma.partnerRequest.update({
      where: { id },
      data: { status: "APPROVED" },
    }),
  ]);

  await logAdminAction(prisma, {
    actor,
    action: "create",
    entityType: "partner",
    entityId: partner.id,
    entityLabel: partner.name,
    after: sanitizeForAudit(partner),
    reason: `تحويل من طلب شريك ${id}`,
    ip: requestIp(req),
  });

  return apiSuccess({ partner, message: "تم التحويل إلى شريك بنجاح" });
}
