import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { apiSuccess, apiBadRequest } from "@/lib/api/response";
import { normalizePhone } from "@/lib/auth/otp";
import { hashPassword } from "@/lib/auth/password";
import { createSession, sessionCookieOptions } from "@/lib/auth/session";
import { prisma } from "@/lib/db";

const MIN_PASSWORD_LEN = 8;

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

  const normalizedPhone = normalizePhone(phone);

  const existing = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
  });
  if (existing) {
    return apiBadRequest("هذا الرقم مسجّل مسبقاً. استخدم تسجيل الدخول.");
  }

  const admin = await prisma.adminPhone.findUnique({
    where: { phone: normalizedPhone },
  });
  const role = admin ? "ADMIN" : "CUSTOMER";

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      phone: normalizedPhone,
      passwordHash,
      name,
      email,
      role,
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
