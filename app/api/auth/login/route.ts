import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { apiSuccess, apiBadRequest, apiUnauthorized, apiTooManyRequests } from "@/lib/api/response";
import { createSession, sessionCookieOptions } from "@/lib/auth/session";
import { verifyPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";
import { ACCOUNT_PHONE_ERROR_MESSAGE, normalizeAccountPhone } from "@/lib/phone";
import {
  checkLoginIpRateLimit,
  checkLoginPhoneRateLimit,
  clearLoginAttempts,
  recordFailedLogin,
} from "@/lib/redis/login-limits";

function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

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

  const normalized = normalizeAccountPhone(phone);
  if (!normalized) {
    return apiBadRequest(ACCOUNT_PHONE_ERROR_MESSAGE);
  }

  const ip = getClientIp(req);
  const [phoneAllowed, ipAllowed] = await Promise.all([
    checkLoginPhoneRateLimit(normalized),
    ip ? checkLoginIpRateLimit(ip) : Promise.resolve(true),
  ]);
  if (!phoneAllowed || !ipAllowed) {
    return apiTooManyRequests("تجاوزت الحد المسموح من المحاولات. حاول مرة أخرى بعد قليل.");
  }

  const user = await prisma.user.findUnique({
    where: { phone: normalized },
  });

  if (!user) {
    await recordFailedLogin(normalized, ip);
    return apiUnauthorized("رقم الجوال أو كلمة المرور غير صحيحة");
  }

  if (!user.passwordHash) {
    await recordFailedLogin(normalized, ip);
    return apiUnauthorized("هذا الحساب مسجّل بالتحقق برمز. أنشئ كلمة مرور من صفحة التسجيل أو استخدم إنشاء حساب.");
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordFailedLogin(normalized, ip);
    return apiUnauthorized("رقم الجوال أو كلمة المرور غير صحيحة");
  }

  await clearLoginAttempts(normalized);

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
  const { mergeGuestAddressIntoUser } = await import("@/lib/addresses/merge-guest-address");
  await mergeGuestAddressIntoUser(user.id);

  return apiSuccess(
    { userId: user.id, role: user.role },
    "تم تسجيل الدخول",
    200
  );
}
