import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { apiSuccess, apiBadRequest, apiUnauthorized } from "@/lib/api/response";
import { createSession, sessionCookieOptions } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { EGYPT_MOBILE_ERROR_MESSAGE, normalizeEgyptMobilePhone } from "@/lib/phone";

export async function POST(req: NextRequest) {
  let body: { phone?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const phone = body.phone?.trim();
  const password = body.password;
  if (!phone || !password) {
    return apiBadRequest("رقم الجوال وكلمة المرور مطلوبان");
  }

  const normalized = normalizeEgyptMobilePhone(phone);
  if (!normalized) {
    return apiBadRequest(EGYPT_MOBILE_ERROR_MESSAGE);
  }
  const user = await prisma.user.findUnique({
    where: { phone: normalized },
  });

  if (!user) {
    return apiUnauthorized("رقم الجوال أو كلمة المرور غير صحيحة");
  }

  if (!user.passwordHash) {
    return apiUnauthorized("هذا الحساب مسجّل بالتحقق برمز. أنشئ كلمة مرور من صفحة التسجيل أو استخدم إنشاء حساب.");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return apiUnauthorized("رقم الجوال أو كلمة المرور غير صحيحة");
  }

  const sessionToken = await createSession({
    userId: user.id,
    phone: user.phone,
    role: user.role,
  });

  const opts = sessionCookieOptions();
  const cookieStore = await cookies();
  cookieStore.set(opts.name, sessionToken, {
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    maxAge: opts.maxAge,
    path: opts.path,
  });

  const { mergeGuestCartIntoUser } = await import("@/lib/cart/cart");
  await mergeGuestCartIntoUser(user.id);

  return apiSuccess(
    { userId: user.id, role: user.role },
    "تم تسجيل الدخول",
    200
  );
}
