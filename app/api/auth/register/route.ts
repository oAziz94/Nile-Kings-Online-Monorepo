import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { apiSuccess, apiBadRequest, apiTooManyRequests } from "@/lib/api/response";
import { verifyOtpForRegistration } from "@/lib/auth/otp";
import { hashPassword } from "@/lib/auth/password";
import { createSession, sessionCookieOptions } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

const MIN_PASSWORD_LEN = 8;

export async function POST(req: NextRequest) {
  let body: {
    phone?: string;
    code?: string;
    name?: string;
    email?: string;
    password?: string;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const phone = body.phone?.trim();
  const code = body.code?.trim();
  const name = body.name?.trim();
  const email = body.email?.trim() || null;
  const password = body.password;

  if (!phone || !code) {
    return apiBadRequest("رقم الجوال ورمز التحقق مطلوبان");
  }
  if (!name || name.length < 2) {
    return apiBadRequest("الاسم مطلوب (حرفان على الأقل)");
  }
  if (!password || password.length < MIN_PASSWORD_LEN) {
    return apiBadRequest(`كلمة المرور مطلوبة (${MIN_PASSWORD_LEN} أحرف على الأقل)`);
  }

  const ip = getClientIp(req);
  const result = await verifyOtpForRegistration(phone, code, ip);

  if (!result.success) {
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

  const existing = await prisma.user.findUnique({
    where: { phone: result.phone },
  });
  if (existing) {
    return apiBadRequest("هذا الرقم مسجّل مسبقاً. استخدم تسجيل الدخول.");
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      phone: result.phone,
      passwordHash,
      name,
      email,
      role: result.role,
    },
  });

  const sessionToken = await createSession({
    userId: user.id,
    phone: user.phone,
    role: user.role as "CUSTOMER" | "ADMIN",
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
    "تم إنشاء الحساب وتسجيل الدخول",
    200
  );
}
