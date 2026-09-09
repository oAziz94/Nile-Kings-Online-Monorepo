import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { apiSuccess, apiBadRequest, apiTooManyRequests } from "@/lib/api/response";
import { verifyOtp } from "@/lib/auth/otp";
import { createSession, sessionCookieOptions } from "@/lib/auth/session";

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
  const result = await verifyOtp(phone, code, ip);

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

  const { prisma } = await import("@/lib/db");
  const user = await prisma.user.findUnique({
    where: { id: result.userId },
    select: { phone: true },
  });
  const phoneForSession = user?.phone ?? phone;

  const sessionToken = await createSession({
    userId: result.userId,
    phone: phoneForSession,
    role: result.role,
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
  await mergeGuestCartIntoUser(result.userId);
  const { mergeGuestAddressIntoUser } = await import("@/lib/addresses/merge-guest-address");
  await mergeGuestAddressIntoUser(result.userId);

  return apiSuccess(
    { userId: result.userId, role: result.role },
    "تم تسجيل الدخول",
    200
  );
}
