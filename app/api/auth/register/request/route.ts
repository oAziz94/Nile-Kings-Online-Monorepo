import { NextRequest } from "next/server";
import { apiSuccess, apiBadRequest, apiTooManyRequests } from "@/lib/api/response";
import { requestRegisterOtp } from "@/lib/auth/register-otp";
import { ACCOUNT_PHONE_ERROR_MESSAGE } from "@/lib/phone";

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
  const result = await requestRegisterOtp(phone, ip);

  if (result.success) {
    return apiSuccess(
      { cooldownSeconds: result.cooldownSeconds ?? 60 },
      "تم إرسال رمز التحقق عبر واتساب",
      200
    );
  }

  switch (result.reason) {
    case "already_registered":
      return apiBadRequest("هذا الرقم مسجّل مسبقاً. استخدم تسجيل الدخول.");
    case "invalid_phone":
      return apiBadRequest(ACCOUNT_PHONE_ERROR_MESSAGE);
    case "rate_limited":
      return apiTooManyRequests("تجاوزت الحد المسموح من المحاولات. حاول مرة أخرى بعد قليل.");
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
    case "send_error":
      return apiBadRequest("فشل إرسال الرسالة. حاول لاحقاً.");
    default:
      return apiBadRequest("فشل طلب التحقق");
  }
}
