import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { apiSuccess, apiBadRequest, apiTooManyRequests, apiUnauthorized } from "@/lib/api/response";
import { hashPassword } from "@/lib/auth/password";
import { createSession, sessionCookieOptions } from "@/lib/auth/session";
import { verifyRegisterToken } from "@/lib/auth/register-otp";
import { prisma } from "@/lib/db";
import {
  checkRegisterIpRateLimit,
  checkRegisterPhoneRateLimit,
  clearRegisterAttempts,
  recordFailedRegister,
} from "@/lib/redis/register-limits";

const MIN_PASSWORD_LEN = 8;

function getClientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

/**
 * Account creation, now gated on a `registerToken` (proof of a completed WhatsApp OTP
 * verification for this exact phone — see lib/auth/register-otp.ts) instead of a raw `phone` in
 * the body. Backlog 4.4: "phone -> WhatsApp OTP -> profile -> create account" — this route is the
 * final "create account" step; the phone->OTP steps live at
 * /api/auth/register/{request,verify}, mirroring forgot-password's request/verify/reset split.
 */
export async function POST(req: NextRequest) {
  let body: {
    registerToken?: string;
    name?: string;
    email?: string;
    password?: string;
  };
  try {
    body = await req.json();
  } catch {
    return apiBadRequest("جسم الطلب غير صالح");
  }

  const registerToken = body.registerToken?.trim();
  const name = body.name?.trim();
  const email = body.email?.trim() || null;
  const password = body.password;

  if (!registerToken) {
    return apiBadRequest("رمز التحقق مطلوب");
  }
  if (!name || name.length < 2) {
    return apiBadRequest("الاسم مطلوب (حرفان على الأقل)");
  }
  if (!password || password.length < MIN_PASSWORD_LEN) {
    return apiBadRequest(`كلمة المرور مطلوبة (${MIN_PASSWORD_LEN} أحرف على الأقل)`);
  }

  const normalizedPhone = await verifyRegisterToken(registerToken);
  if (!normalizedPhone) {
    return apiUnauthorized(
      "انتهت صلاحية جلسة التحقق أو أنها غير صحيحة. أعد طلب رمز التحقق."
    );
  }

  const ip = getClientIp(req);
  const [phoneAllowed, ipAllowed] = await Promise.all([
    checkRegisterPhoneRateLimit(normalizedPhone),
    ip ? checkRegisterIpRateLimit(ip) : Promise.resolve(true),
  ]);
  if (!phoneAllowed || !ipAllowed) {
    return apiTooManyRequests("تجاوزت الحد المسموح من المحاولات. حاول مرة أخرى بعد قليل.");
  }

  const existing = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
  });
  if (existing) {
    // Same dead-end as before (register.md's Notes / backlog 4.2 "Explicitly NOT in scope"): no
    // claim/recovery path from this screen. In the normal flow this can no longer actually
    // happen (requestRegisterOtp already rejects an already-registered phone before an OTP is
    // ever sent), but stays here as a defense-in-depth check against a race (e.g. the same phone
    // completing two verified OTP flows in two tabs) between OTP verification and this step.
    await recordFailedRegister(normalizedPhone, ip);
    return apiBadRequest("هذا الرقم مسجّل مسبقاً. استخدم تسجيل الدخول.");
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await prisma.user.create({
      data: {
        phone: normalizedPhone,
        passwordHash,
        name,
        email,
        role: "CUSTOMER",
      },
    });
  } catch (err) {
    // Two concurrent requests can both pass the `existing` check above before either has
    // inserted (a real race in a multi-instance deployment, flagged during backlog 4.4's
    // verification even though this create call predates that task). Map the resulting
    // unique-constraint violation on `phone` to the same clean "already registered" response
    // instead of letting it surface as a generic 500.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      await recordFailedRegister(normalizedPhone, ip);
      return apiBadRequest("هذا الرقم مسجّل مسبقاً. استخدم تسجيل الدخول.");
    }
    throw err;
  }

  await clearRegisterAttempts(normalizedPhone);

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
  const { mergeGuestAddressIntoUser } = await import("@/lib/addresses/merge-guest-address");
  await mergeGuestAddressIntoUser(user.id);

  return apiSuccess(
    { userId: user.id, role: user.role },
    "تم إنشاء الحساب وتسجيل الدخول",
    200
  );
}
