import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { apiSuccess, apiBadRequest, apiTooManyRequests } from "@/lib/api/response";
import { hashPassword } from "@/lib/auth/password";
import { createSession, sessionCookieOptions } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ACCOUNT_PHONE_ERROR_MESSAGE, normalizeAccountPhone } from "@/lib/phone";
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

export async function POST(req: NextRequest) {
  let body: {
    phone?: string;
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
  const name = body.name?.trim();
  const email = body.email?.trim() || null;
  const password = body.password;

  if (!phone) {
    return apiBadRequest("رقم الجوال مطلوب");
  }
  if (!name || name.length < 2) {
    return apiBadRequest("الاسم مطلوب (حرفان على الأقل)");
  }
  if (!password || password.length < MIN_PASSWORD_LEN) {
    return apiBadRequest(`كلمة المرور مطلوبة (${MIN_PASSWORD_LEN} أحرف على الأقل)`);
  }

  // International account phone (all 22 dropdown countries), same validator as login —
  // see docs/redesign/04-decisions.md 2026-09-10 "International account phone numbers".
  const normalizedPhone = normalizeAccountPhone(phone);
  if (!normalizedPhone) {
    return apiBadRequest(ACCOUNT_PHONE_ERROR_MESSAGE);
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
    // Deliberately out of scope for this task: a phone that already exists (including a
    // passwordless account created by the now-removed OTP flow) still has no claim/recovery
    // path from this screen — see docs/redesign/00-feature-inventory/auth/register.md's Notes
    // and docs/redesign/03-backlog.md 4.2 "Explicitly NOT in scope". Behavior preserved as-is.
    await recordFailedRegister(normalizedPhone, ip);
    return apiBadRequest("هذا الرقم مسجّل مسبقاً. استخدم تسجيل الدخول.");
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      phone: normalizedPhone,
      passwordHash,
      name,
      email,
      role: "CUSTOMER",
    },
  });

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
