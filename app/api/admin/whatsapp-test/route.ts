import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { getWhatsAppService, normalizePhoneForWhatsApp } from "@/lib/services/whatsapp";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/api/response";

/**
 * POST /api/admin/whatsapp-test
 * Body: { to: "01012345678" } – send a test text message to an approved WhatsApp number.
 * Admin-only. Use to verify Meta WhatsApp Cloud API configuration.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    const err = e as { status?: number };
    if (err.status === 401) return apiUnauthorized("يجب تسجيل الدخول");
    if (err.status === 403) return apiForbidden("غير مصرح");
    throw e;
  }

  let body: { to?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  if (!to) return apiBadRequest("الحقل to مطلوب (رقم هاتف للاختبار، مثلاً 01012345678)");

  const normalized = normalizePhoneForWhatsApp(to);
  const message =
    typeof body?.message === "string" && body.message.trim()
      ? body.message.trim()
      : "رسالة اختبار من ملوك النيل – WhatsApp Cloud API.";

  const service = getWhatsAppService();
  const result = await service.sendOrderAssignment(to, message);

  if (result.ok) {
    return apiSuccess({
      sent: true,
      to: normalized,
      message: "تم إرسال رسالة الاختبار.",
    });
  }
  return apiBadRequest(result.error, { code: "WHATSAPP_SEND_FAILED", to: normalized });
}
