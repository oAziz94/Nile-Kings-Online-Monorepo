import { NextRequest } from "next/server";
import { apiSuccess, apiBadRequest, apiTooManyRequests, apiForbidden } from "@/lib/api/response";
import { requestPasswordResetOtp } from "@/lib/auth/forgot-password";
import { EGYPT_MOBILE_ERROR_MESSAGE } from "@/lib/phone";

function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

export async function POST(req: NextRequest) {
  let body: { phone?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const phone = body.phone?.trim();
  if (!phone) {
    return apiBadRequest("رقم الجوال مطلوب");
  }

  const ip = getClientIp(req);
  const result = await requestPasswordResetOtp(phone, ip);

  if (result.success) {
    return apiSuccess(
      { cooldownSeconds: result.cooldownSeconds ?? 60 },
      "تم إرسال رمز التحقق إلى جوالك",
      200
    );
  }

  switch (result.reason) {
    case "admin_phone":
      return apiForbidden("لا يمكن استعادة كلمة المرور لهذا الرقم");
    case "invalid_phone":
      return apiBadRequest(EGYPT_MOBILE_ERROR_MESSAGE);
    case "no_account":
      return apiBadRequest("لا يوجد حساب بهذا الرقم أو الحساب لا يستخدم كلمة مرور");
    case "cooldown":
      return apiTooManyRequests(
        `انتظر ${result.cooldownSeconds} ثانية قبل إعادة الإرسال`
      );
    case "rate_limit_phone":
      return apiTooManyRequests("تجاوزت الحد المسموح من الطلبات لهذا الرقم");
    case "rate_limit_ip":
      return apiTooManyRequests("تجاوزت الحد المسموح من الطلبات");
    case "locked":
      return apiTooManyRequests(
        `الحساب مؤقتاً مقفل. حاول بعد ${"lockMinutes" in result ? result.lockMinutes : 0} دقيقة`
      );
    case "twilio_error":
      return apiBadRequest("فشل إرسال الرسالة. حاول لاحقاً.");
    default:
      return apiBadRequest("فشل طلب التحقق");
  }
}
