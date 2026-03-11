import { NextRequest } from "next/server";
import { apiSuccess, apiBadRequest, apiUnauthorized } from "@/lib/api/response";
import { resetPasswordWithToken } from "@/lib/auth/forgot-password";

const MIN_PASSWORD_LEN = 8;

export async function POST(req: NextRequest) {
  let body: { resetToken?: string; newPassword?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const resetToken = body.resetToken?.trim();
  const newPassword = body.newPassword;

  if (!resetToken) {
    return apiBadRequest("رمز الاستعادة مطلوب");
  }
  if (typeof newPassword !== "string" || newPassword.length < MIN_PASSWORD_LEN) {
    return apiBadRequest(`كلمة المرور الجديدة يجب أن تكون ${MIN_PASSWORD_LEN} أحرف على الأقل`);
  }

  const result = await resetPasswordWithToken(resetToken, newPassword);

  if (result.success) {
    return apiSuccess(null, "تم تغيير كلمة المرور. يمكنك تسجيل الدخول الآن.", 200);
  }

  switch (result.reason) {
    case "invalid_token":
      return apiUnauthorized("انتهت صلاحية الرابط أو أنه غير صحيح. أعد طلب استعادة كلمة المرور.");
    case "no_user":
      return apiUnauthorized("الحساب غير موجود.");
    default:
      return apiBadRequest("فشل تغيير كلمة المرور");
  }
}
