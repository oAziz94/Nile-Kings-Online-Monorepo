import { NextRequest } from "next/server";
import { apiSuccess, apiBadRequest, apiTooManyRequests } from "@/lib/api/response";
import { verifyPasswordResetOtp } from "@/lib/auth/forgot-password";

function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

export async function POST(req: NextRequest) {
  let body: { phone?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const phone = body.phone?.trim();
  const code = body.code?.trim();
  if (!phone || !code) {
    return apiBadRequest("رقم الجوال ورمز التحقق مطلوبان");
  }

  const ip = getClientIp(req);
  const result = await verifyPasswordResetOtp(phone, code, ip);

  if (result.success) {
    return apiSuccess(
      { resetToken: result.resetToken },
      "تم التحقق. أدخل كلمة المرور الجديدة.",
      200
    );
  }

  switch (result.reason) {
    case "locked":
      return apiTooManyRequests(
        `الحساب مؤقتاً مقفل. حاول بعد ${"lockMinutes" in result ? result.lockMinutes : 0} دقيقة`
      );
    case "too_many_attempts":
      return apiTooManyRequests("عدد المحاولات كبير. حاول لاحقاً.");
    case "expired":
      return apiBadRequest("انتهت صلاحية الرمز. اطلب رمزاً جديداً.");
    case "invalid":
    default:
      return apiBadRequest("رمز التحقق غير صحيح");
  }
}
