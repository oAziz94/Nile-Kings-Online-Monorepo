import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { apiSuccess, apiBadRequest, apiInternal } from "@/lib/api/response";
import { partnerRequestBodySchema } from "@/lib/partner-request-schema";
import { sendPartnerRequestNotification } from "@/lib/email";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const parsed = partnerRequestBodySchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const msg =
      typeof first === "object" && first && Object.keys(first).length > 0
        ? (Object.values(first)[0] as string[])?.[0] ?? "بيانات غير صالحة"
        : "بيانات غير صالحة";
    return apiBadRequest(msg);
  }

  const data = parsed.data;

  try {
    const request = await prisma.partnerRequest.create({
      data: {
        requestType: data.requestType,
        name: data.name,
        governorate: data.governorate,
        phone: data.phone,
        facebookUrl: data.facebookUrl ?? null,
        instagramUrl: data.instagramUrl ?? null,
        tiktokUrl: data.tiktokUrl ?? null,
        youtubeUrl: data.youtubeUrl ?? null,
        websiteUrl: data.websiteUrl ?? null,
        otherUrl: data.otherUrl ?? null,
      },
    });

    await sendPartnerRequestNotification({
      requestType: data.requestType,
      name: data.name,
      governorate: data.governorate,
      phone: data.phone,
      facebookUrl: data.facebookUrl,
      instagramUrl: data.instagramUrl,
      tiktokUrl: data.tiktokUrl,
      youtubeUrl: data.youtubeUrl,
      websiteUrl: data.websiteUrl,
      otherUrl: data.otherUrl,
    });

    return apiSuccess({ id: request.id }, "تم استلام طلبك بنجاح، سنتواصل معك قريباً");
  } catch (e) {
    console.error("[partner-requests] POST error:", e);
    return apiInternal("حدث خطأ، يرجى المحاولة لاحقاً");
  }
}
